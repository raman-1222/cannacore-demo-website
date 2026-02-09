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
    const allUploadedPaths = [];
    
    if (images) {
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const uniqueImageId = crypto.randomBytes(8).toString('hex');
        const imageExtension = path.extname(image.originalname) || '.jpg';
        const imageFilename = `image-${uniqueImageId}${imageExtension}`;
        const imagePath = `images/${imageFilename}`;
        
        const { data: imageData, error: imageError } = await supabase.storage
          .from('cannacore')
          .upload(imagePath, image.buffer, {
            contentType: image.mimetype
          });
        
        if (imageError) {
          throw new Error(`Failed to upload image: ${imageError.message}`);
        }
        
        // Get public URL for image
        const { data: imageUrlData } = supabase.storage
          .from('cannacore')
          .getPublicUrl(imagePath);
        
        imageUrls.push(imageUrlData.publicUrl);
        allUploadedPaths.push(imagePath);
        uploadedImagePaths.push(imagePath);
      }
    }

    console.log('Images uploaded successfully. Count:', imageUrls.length);

    // Upload COA PDF if provided
    let pdfUrls = [];
    if (pdf) {
      console.log('Uploading COA PDF to Supabase...');
      const uniquePdfId = crypto.randomBytes(8).toString('hex');
      const pdfExtension = path.extname(pdf.originalname) || '.pdf';
      const pdfFilename = `coa-pdf-${uniquePdfId}${pdfExtension}`;
      const pdfPath = `pdfs/${pdfFilename}`;
      
      const { data: pdfData, error: pdfError } = await supabase.storage
        .from('cannacore')
        .upload(pdfPath, pdf.buffer, {
          contentType: pdf.mimetype
        });
      
      if (pdfError) {
        throw new Error(`Failed to upload COA PDF: ${pdfError.message}`);
      }
      
      // Get public URL for PDF
      const { data: pdfUrlData } = supabase.storage
        .from('cannacore')
        .getPublicUrl(pdfPath);
      
      pdfUrls.push(pdfUrlData.publicUrl);
      allUploadedPaths.push(pdfPath);
    } else {
      console.log('No COA PDF uploaded');
    }

    // Upload labels PDF if provided
    let labelsPdfUrl = null;
    if (labelsPdf) {
      console.log('Uploading labels PDF to Supabase...');
      const uniqueLabelsPdfId = crypto.randomBytes(8).toString('hex');
      const labelsPdfExtension = path.extname(labelsPdf.originalname) || '.pdf';
      const labelsPdfFilename = `labels-pdf-${uniqueLabelsPdfId}${labelsPdfExtension}`;
      const labelsPdfPath = `labels-pdfs/${labelsPdfFilename}`;
      
      const { data: labelsPdfData, error: labelsPdfError } = await supabase.storage
        .from('cannacore')
        .upload(labelsPdfPath, labelsPdf.buffer, {
          contentType: labelsPdf.mimetype
        });
      
      if (labelsPdfError) {
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
    }

    console.log('=== LAMATIC API CALL ===');

    // Prepare GraphQL query for Lamatic
    const lamaticApiKey = process.env.LAMATIC_API_KEY;
    const workflowId = process.env.LAMATIC_WORKFLOW_ID;

    if (!lamaticApiKey || !workflowId) {
      throw new Error('Lamatic API key or workflow ID is missing. Check environment variables.');
    }

    // Construct the GraphQL query
    const graphqlQuery = `
      query runComplianceCheck(
        $lamaticApiKey: String!, 
        $workflowId: String!, 
        $imageUrls: [String!]!,
        $jurisdictions: [String!]!,
        $coaurl: [String!]!,
        $labelurl: [String!]!,
        $date: String!,
        $time: String!,
        $company_name: String!,
        $product_type: String!
      ) {
        lamaticApi(
          apiKey: $lamaticApiKey
          workflowId: $workflowId
          input: {
            imageUrls: $imageUrls
            jurisdictions: $jurisdictions
            coaurl: $coaurl
            labelurl: $labelurl
            date: $date
            time: $time
            company_name: $company_name
            product_type: $product_type
          }
        ) {
          output
        }
      }
    `;

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US');
    const timeStr = now.toLocaleTimeString('en-US');
    const companyName = req.body.company_name || 'N/A';
    const productType = req.body.product_type || 'N/A';

    // Make the request to Lamatic
    const response = await axios.post('https://api.lamatic.ai/graphql', {
      query: graphqlQuery,
      variables: {
        lamaticApiKey: lamaticApiKey,
        workflowId: workflowId,
        imageUrls: imageUrls,
        jurisdictions: jurisdictions,
        coaurl: pdfUrls.length > 0 ? pdfUrls : ["https://cdn.shopify.com/s/files/1/0665/8188/9159/files/Blueberry_-_Mega_Smasher_s.pdf?v=1764824884"],
        labelurl: allImageUrls,
        date: dateStr,
        time: timeStr,
        company_name: companyName,
        product_type: productType
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });

    console.log('Lamatic API Response received');

    if (response.data.errors) {
      throw new Error(`Lamatic API Error: ${response.data.errors[0]?.message}`);
    }

    const result = response.data.data?.lamaticApi?.output;

    if (!result) {
      throw new Error('No output from Lamatic API');
    }

    let parsedOutput = result;
    if (typeof result === 'string') {
      try {
        parsedOutput = JSON.parse(result);
      } catch (e) {
        console.error('Failed to parse Lamatic output:', result);
        throw new Error('Could not parse Lamatic API response');
      }
    }

    console.log('Parsed Lamatic output');

    // Return the compliance results
    res.json({
      success: true,
      ...parsedOutput
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

// Export for Vercel
module.exports = app;
