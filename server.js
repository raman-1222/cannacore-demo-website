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
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    if (file.fieldname === 'images') {
      // Accept images only
      if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Only image files are allowed for images!'), false);
      }
    } else if (file.fieldname === 'pdf') {
      // Accept PDF only
      if (file.mimetype !== 'application/pdf') {
        return cb(new Error('Only PDF files are allowed for COA!'), false);
      }
    }
    cb(null, true);
  }
});

// API endpoint to handle file uploads and compliance check
app.post('/api/check-compliance', apiLimiter, upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'pdf', maxCount: 1 }
]), async (req, res) => {
  try {
    // Validate uploads
    if (!req.files || !req.files.images || !req.files.pdf) {
      return res.status(400).json({
        error: 'Please upload both images and a PDF file'
      });
    }

    // Check if Supabase is configured
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        error: 'Supabase configuration is missing. Please check environment variables.'
      });
    }

    const images = req.files.images;
    const pdf = req.files.pdf[0];

    console.log('=== SUPABASE UPLOAD ===');
    console.log('Uploading images to Supabase...');

    // Upload images to Supabase Storage
    const imageUrls = [];
    const uploadedImagePaths = [];
    
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
        if (uploadedImagePaths.length > 0) {
          try {
            await supabase.storage
              .from('cannacore')
              .remove(uploadedImagePaths);
          } catch (cleanupError) {
            console.error('Failed to cleanup images after error:', cleanupError);
          }
        }
        throw new Error(`Failed to upload image: ${imageError.message}`);
      }
      
      // Get public URL
      const { data: imageUrlData } = supabase.storage
        .from('cannacore')
        .getPublicUrl(imagePath);
      
      imageUrls.push(imageUrlData.publicUrl);
      uploadedImagePaths.push(imagePath);
    }

    // Upload PDF to Supabase Storage
    const uniquePdfId = crypto.randomUUID();
    const pdfExtension = path.extname(pdf.originalname) || '.pdf';
    const pdfFilename = `pdf-${uniquePdfId}${pdfExtension}`;
    const pdfPath = `pdfs/${pdfFilename}`;
    
    const { data: pdfData, error: pdfError } = await supabase.storage
      .from('cannacore')
      .upload(pdfPath, pdf.buffer, {
        contentType: pdf.mimetype
      });
    
    if (pdfError) {
      // Cleanup already uploaded images
      try {
        await supabase.storage
          .from('cannacore')
          .remove(uploadedImagePaths);
      } catch (cleanupError) {
        console.error('Failed to cleanup images after PDF upload error:', cleanupError);
      }
      throw new Error(`Failed to upload PDF: ${pdfError.message}`);
    }
    
    // Get public URL for PDF
    const { data: pdfUrlData } = supabase.storage
      .from('cannacore')
      .getPublicUrl(pdfPath);
    
    const pdfUrl = pdfUrlData.publicUrl;
    const allUploadedPaths = [...uploadedImagePaths, pdfPath];

    console.log('Image URLs:', imageUrls);
    console.log('PDF URL:', pdfUrl);

    // Prepare Lamatic API request
    const lamatic_api_key = process.env.LAMATIC_API_KEY;
    const lamatic_api_url = process.env.LAMATIC_API_URL;
    const lamatic_workflow_id = process.env.LAMATIC_WORKFLOW_ID;
    const lamatic_project_id = process.env.LAMATIC_PROJECT_ID;

    if (!lamatic_api_key) {
      // Cleanup uploaded files before returning
      try {
        await supabase.storage
          .from('cannacore')
          .remove(allUploadedPaths);
      } catch (cleanupError) {
        console.error('Failed to cleanup files after config error:', cleanupError);
      }
      return res.status(500).json({
        error: 'LAMATIC_API_KEY is not configured'
      });
    }

    if (!lamatic_api_url || !lamatic_workflow_id || !lamatic_project_id) {
      // Cleanup uploaded files before returning
      try {
        await supabase.storage
          .from('cannacore')
          .remove(allUploadedPaths);
      } catch (cleanupError) {
        console.error('Failed to cleanup files after config error:', cleanupError);
      }
      return res.status(500).json({
        error: 'Lamatic API configuration is incomplete. Please check environment variables.'
      });
    }

    const query = `
      query ExecuteWorkflow(
        $workflowId: String!
        $imageurl: [String]
        $coaurl: String        
      ) {
        executeWorkflow(
          workflowId: $workflowId
          payload: {
            imageurl: $imageurl
            coaurl: $coaurl
          }
        ) {
          status
          result
        }
      }`;

    const variables = {
      "workflowId": lamatic_workflow_id,
      "imageurl": imageUrls,
      "coaurl": pdfUrl
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
      apiError = error;
    } finally {
      // Cleanup files from Supabase after API call (whether success or failure)
      // Only attempt cleanup if files were uploaded
      if (allUploadedPaths && allUploadedPaths.length > 0) {
        console.log('Cleaning up files from Supabase...');
        try {
          await supabase.storage
            .from('cannacore')
            .remove(allUploadedPaths);
        } catch (cleanupError) {
          console.error('Failed to cleanup files from Supabase:', cleanupError);
        }
      }
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
    // The API returns { output: { compliant_items, non_compliant_items, _meta }, requestId }
    // Extract the relevant data from the nested structure
    let responseData = result;
    if (result && result.output) {
      responseData = {
        compliant_items: result.output.compliant_items || [],
        non_compliant_items: result.output.non_compliant_items || []
      };
    }

    res.json({
      status: workflowResult.status,
      result: responseData
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
