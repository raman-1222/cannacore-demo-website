require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Helper function to verify URL is accessible
async function verifyUrlAccessible(url) {
  try {
    const response = await axios.head(url, { timeout: 5000 });
    console.log(`URL verified: ${url} - Status ${response.status}`);
    return response.status === 200;
  } catch (error) {
    console.error(`URL verification failed for ${url}:`, error.message);
    return false;
  }
}

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Rate limiting configuration
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads - use memory storage for Supabase
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.fieldname === 'images') {
      // Accept images only
      if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Only image files are allowed for images!'), false);
      }
    } else if (file.fieldname === 'pdf' || file.fieldname === 'labelsPdf') {
      // Accept PDF only for both COA and labels
      if (file.mimetype !== 'application/pdf') {
        return cb(new Error('Only PDF files are allowed!'), false);
      }
    }
    cb(null, true);
  }
});

// API endpoint to handle file uploads and compliance check
app.post('/api/check-compliance', apiLimiter, upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'pdf', maxCount: 10 },
  { name: 'labelsPdf', maxCount: 1 }
]), async (req, res) => {
  try {
    // Validate uploads - at least images or labels PDF is required
    if (!req.files || (!req.files.images && !req.files.labelsPdf)) {
      return res.status(400).json({
        error: 'Please upload either product images or labels PDF'
      });
    }

    // Check if Supabase is configured
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        error: 'Supabase configuration is missing. Please check environment variables.'
      });
    }

    const images = req.files.images;
    const pdf = req.files.pdf ? req.files.pdf[0] : null;
    const labelsPdf = req.files.labelsPdf ? req.files.labelsPdf[0] : null;
    const jurisdictions = req.body.jurisdictions || [];

    console.log('=== SUPABASE UPLOAD ===');
    console.log('Uploading images to Supabase...');

    // Upload images to Supabase Storage
    const imageUrls = [];
    const uploadedImagePaths = [];
    
    if (images) {
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const uniqueId = crypto.randomUUID();
        const imageFilename = `image-${uniqueId}${path.extname(image.originalname)}`;
        const imagePath = `images/${imageFilename}`;
        
        const { data: imageData, error: imageError } = await supabase.storage
          .from('cannacore')
          .upload(imagePath, image.buffer, {
            contentType: image.mimetype
          });
        
        if (imageError) {
          // Cleanup previously uploaded images
          // if (uploadedImagePaths.length > 0) {
          //   try {
          //     await supabase.storage
          //       .from('cannacore')
          //       .remove(uploadedImagePaths);
          //   } catch (cleanupError) {
          //     console.error('Failed to cleanup images after error:', cleanupError);
          //   }
          // }
          throw new Error(`Failed to upload image: ${imageError.message}`);
        }
        
        // Get public URL
        const { data: imageUrlData } = supabase.storage
          .from('cannacore')
          .getPublicUrl(imagePath);
        
        imageUrls.push(imageUrlData.publicUrl);
        uploadedImagePaths.push(imagePath);
      }
    } else {
      console.log('No images uploaded');
    }

    // Upload PDFs to Supabase Storage (optional)
    let pdfUrls = [];
    const allUploadedPaths = [...uploadedImagePaths];
    
    if (pdf) {
      // Handle both single file and array of files
      const pdfFiles = Array.isArray(pdf) ? pdf : [pdf];
      
      for (const pdfFile of pdfFiles) {
        const uniquePdfId = crypto.randomUUID();
        const pdfExtension = path.extname(pdfFile.originalname) || '.pdf';
        const pdfFilename = `pdf-${uniquePdfId}${pdfExtension}`;
        const pdfPath = `pdfs/${pdfFilename}`;
        
        const { data: pdfData, error: pdfError } = await supabase.storage
          .from('cannacore')
          .upload(pdfPath, pdfFile.buffer, {
            contentType: pdfFile.mimetype
          });
        
        if (pdfError) {
          // Cleanup already uploaded files
          // try {
          //   await supabase.storage
          //     .from('cannacore')
          //     .remove(allUploadedPaths);
          // } catch (cleanupError) {
          //   console.error('Failed to cleanup files after PDF upload error:', cleanupError);
          // }
          throw new Error(`Failed to upload PDF: ${pdfError.message}`);
        }
        
        // Get public URL for PDF
        const { data: pdfUrlData } = supabase.storage
          .from('cannacore')
          .getPublicUrl(pdfPath);
        
        pdfUrls.push(pdfUrlData.publicUrl);
        allUploadedPaths.push(pdfPath);
      }
    } else {
      console.log('No PDFs uploaded');
    }

    console.log('Image URLs:', imageUrls);
    console.log('PDF URLs:', pdfUrls);

    // Upload Labels PDF to Supabase Storage (optional)
    let labelsPdfUrl = '';
    
    if (labelsPdf) {
      const uniqueLabelsPdfId = crypto.randomUUID();
      const labelsPdfExtension = path.extname(labelsPdf.originalname) || '.pdf';
      const labelsPdfFilename = `labels-pdf-${uniqueLabelsPdfId}${labelsPdfExtension}`;
      const labelsPdfPath = `labels-pdfs/${labelsPdfFilename}`;
      
      const { data: labelsPdfData, error: labelsPdfError } = await supabase.storage
        .from('cannacore')
        .upload(labelsPdfPath, labelsPdf.buffer, {
          contentType: labelsPdf.mimetype
        });
      
      if (labelsPdfError) {
        // Cleanup already uploaded files
        // try {
        //   await supabase.storage
        //     .from('cannacore')
        //     .remove(allUploadedPaths);
        // } catch (cleanupError) {
        //   console.error('Failed to cleanup files after labels PDF upload error:', cleanupError);
        // }
        throw new Error(`Failed to upload labels PDF: ${labelsPdfError.message}`);
      }
      
      // Get public URL for labels PDF
      const { data: labelsPdfUrlData } = supabase.storage
        .from('cannacore')
        .getPublicUrl(labelsPdfPath);
      
      labelsPdfUrl = labelsPdfUrlData.publicUrl;
      allUploadedPaths.push(labelsPdfPath);
    } else {
      console.log('No labels PDF uploaded');
    }

    console.log('Image URLs:', imageUrls);
    console.log('PDF URLs:', pdfUrls);
    console.log('Labels PDF URL:', labelsPdfUrl);

    // Add labels PDF to imageUrls array if provided
    const allImageUrls = [...imageUrls];
    if (labelsPdfUrl) {
      allImageUrls.push(labelsPdfUrl);
      console.log('Added labels PDF URL to image URLs array');
    }

    // Verify all URLs are accessible before calling API
    console.log('Verifying URL accessibility...');
    const allUrlsToVerify = [...allImageUrls, ...pdfUrls];
    for (const url of allUrlsToVerify) {
      if (url) {
        const isAccessible = await verifyUrlAccessible(url);
        if (!isAccessible) {
          // Cleanup files before returning error
          // try {
          //   await supabase.storage
          //     .from('cannacore')
          //     .remove(allUploadedPaths);
          // } catch (cleanupError) {
          //   console.error('Failed to cleanup files:', cleanupError);
          // }
          return res.status(400).json({
            error: `Uploaded file is not accessible at ${url}. Please try uploading again.`
          });
        }
      }
    }
    console.log('All URLs verified successfully');

    // Prepare Lamatic API request
    const lamatic_api_key = process.env.LAMATIC_API_KEY;
    const lamatic_api_url = process.env.LAMATIC_API_URL;
    const lamatic_workflow_id = process.env.LAMATIC_WORKFLOW_ID;
    const lamatic_project_id = process.env.LAMATIC_PROJECT_ID;

    if (!lamatic_api_key) {
      // Cleanup uploaded files before returning
      // try {
      //   await supabase.storage
      //     .from('cannacore')
      //     .remove(allUploadedPaths);
      // } catch (cleanupError) {
      //   console.error('Failed to cleanup files after config error:', cleanupError);
      // }
      return res.status(500).json({
        error: 'LAMATIC_API_KEY is not configured'
      });
    }

    if (!lamatic_api_url || !lamatic_workflow_id || !lamatic_project_id) {
      // Cleanup uploaded files before returning
      // try {
      //   await supabase.storage
      //     .from('cannacore')
      //     .remove(allUploadedPaths);
      // } catch (cleanupError) {
      //   console.error('Failed to cleanup files after config error:', cleanupError);
      // }
      return res.status(500).json({
        error: 'Lamatic API configuration is incomplete. Please check environment variables.'
      });
    }

    const query = `
      query ExecuteWorkflow(
        $workflowId: String!
        $imageurl: [String]
        $coaurl: [String]
        $jurisdictions: [String]
      ) {
        executeWorkflow(
          workflowId: $workflowId
          payload: {
            imageurl: $imageurl
            coaurl: $coaurl
            jurisdictions: $jurisdictions
          }
        ) {
          status
          result
        }
      }`;

    const variables = {
      "workflowId": lamatic_workflow_id,
      "imageurl": allImageUrls,
      "coaurl": pdfUrls.length > 0 ? pdfUrls : ["https://cdn.shopify.com/s/files/1/0665/8188/9159/files/Blueberry_-_Mega_Smasher_s.pdf?v=1764824884"],
      "jurisdictions": Array.isArray(jurisdictions) ? jurisdictions : [jurisdictions].filter(Boolean)
    };

    const options = {
      method: 'POST',
      url: lamatic_api_url,
      headers: {
        Authorization: `Bearer ${lamatic_api_key}`,
        'Content-Type': 'application/json',
        'x-project-id': lamatic_project_id,
      },
      data: { query, variables }
    };

    console.log('=== API REQUEST PAYLOAD ===');
    console.log('URL:', options.url);
    const sanitizedHeaders = { ...options.headers, Authorization: options.headers.Authorization ? '[REDACTED]' : undefined };
    console.log('Headers:', JSON.stringify(sanitizedHeaders, null, 2));
    console.log('Query:', query);
    console.log('Variables:', JSON.stringify(variables, null, 2));
    console.log('Full Request Data:', JSON.stringify(options.data, null, 2));
    console.log('===========================');
    console.log('Calling Lamatic API...');
    
    let response;
    let apiError = null;
    try {
      response = await axios(options);
      console.log('Lamatic API response:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('Lamatic API Error - Status:', error.response?.status);
      console.error('Lamatic API Error - Message:', error.response?.statusText);
      console.error('Lamatic API Error - Data:', JSON.stringify(error.response?.data, null, 2));
      apiError = error;
    } finally {
      // Cleanup files from Supabase after API call
      // Only attempt cleanup if files were uploaded
      // if (allUploadedPaths && allUploadedPaths.length > 0) {
      //   console.log('Cleaning up files from Supabase...');
      //   try {
      //     await supabase.storage
      //       .from('cannacore')
      //       .remove(allUploadedPaths);
      //     console.log('Files successfully cleaned up from Supabase');
      //   } catch (cleanupError) {
      //     console.error('Failed to cleanup files from Supabase:', cleanupError);
      //   }
      // }
    }
    
    // If API call failed, throw the error now (after cleanup)
    if (apiError) {
      throw apiError;
    }

    // Extract the result from the API response
    const workflowResult = response.data?.data?.executeWorkflow;

    if (!workflowResult) {
      return res.status(500).json({
        error: 'Invalid response from Lamatic API'
      });
    }

    // Parse the result if it's a string
    let result;
    if (typeof workflowResult.result === 'string') {
      try {
        result = JSON.parse(workflowResult.result);
      } catch (e) {
        result = workflowResult.result;
      }
    } else {
      result = workflowResult.result;
    }

    // Handle nested output structure
    // The API returns { output: { issues, coa, labels, _meta }, requestId }
    // Pass through the entire result structure
    console.log('Sending response to client with issues:', result?.output?.issues?.length || 0);
    
    res.json({
      status: workflowResult.status,
      result: result
    });

  } catch (error) {
    console.error('Error processing compliance check:', error);
    
    res.status(500).json({
      error: error.response?.data?.errors?.[0]?.message || error.message || 'An error occurred while processing your request'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
