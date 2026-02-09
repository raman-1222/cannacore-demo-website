require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { put } = require('@vercel/blob');
const crypto = require('crypto');

const app = express();

// Trust proxy for Vercel
app.set('trust proxy', 1);

// Rate limiting configuration
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.fieldname === 'images') {
      if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Only image files are allowed for images!'), false);
      }
    } else if (file.fieldname === 'pdf' || file.fieldname === 'labelsPdf') {
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
    if (!req.files || (!req.files.images && !req.files.labelsPdf)) {
      return res.status(400).json({
        error: 'Please upload either product images or labels PDF'
      });
    }

    const images = req.files.images;
    const pdf = req.files.pdf ? req.files.pdf[0] : null;
    const labelsPdf = req.files.labelsPdf ? req.files.labelsPdf[0] : null;
    
    // Ensure jurisdictions is always an array
    let jurisdictions = req.body.jurisdictions || [];
    if (typeof jurisdictions === 'string') {
      jurisdictions = [jurisdictions];
    }
    console.log('DEBUG: jurisdictions after conversion:', jurisdictions, 'Type:', typeof jurisdictions);

    console.log('=== VERCEL BLOB UPLOAD ===');
    console.log('Uploading files to Vercel Blob Storage...');

    // Upload images to Vercel Blob
    const imageUrls = [];
    
    if (images) {
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const uniqueImageId = crypto.randomBytes(8).toString('hex');
        const imageExtension = path.extname(image.originalname) || '.jpg';
        const imageFilename = `images/${uniqueImageId}${imageExtension}`;
        
        try {
          const blob = await put(imageFilename, image.buffer, {
            access: 'public',
            contentType: image.mimetype,
          });
          imageUrls.push(blob.url);
          console.log(`Image uploaded: ${imageFilename}`);
        } catch (error) {
          console.error(`Failed to upload image: ${error.message}`);
          throw new Error(`Failed to upload image: ${error.message}`);
        }
      }
    }

    console.log('Images uploaded successfully. Count:', imageUrls.length);

    // Upload COA PDF if provided
    let pdfUrls = [];
    if (pdf) {
      console.log('Uploading COA PDF to Vercel Blob...');
      const uniquePdfId = crypto.randomBytes(8).toString('hex');
      const pdfExtension = path.extname(pdf.originalname) || '.pdf';
      const pdfFilename = `pdfs/${uniquePdfId}${pdfExtension}`;
      
      try {
        const blob = await put(pdfFilename, pdf.buffer, {
          access: 'public',
          contentType: pdf.mimetype,
        });
        pdfUrls.push(blob.url);
        console.log(`COA PDF uploaded: ${pdfFilename}`);
      } catch (error) {
        console.error(`Failed to upload COA PDF: ${error.message}`);
        throw new Error(`Failed to upload COA PDF: ${error.message}`);
      }
    } else {
      console.log('No COA PDF uploaded');
    }

    // Upload labels PDF if provided
    let labelsPdfUrl = null;
    if (labelsPdf) {
      console.log('Uploading labels PDF to Vercel Blob...');
      const uniqueLabelsPdfId = crypto.randomBytes(8).toString('hex');
      const labelsPdfExtension = path.extname(labelsPdf.originalname) || '.pdf';
      const labelsPdfFilename = `labels-pdfs/${uniqueLabelsPdfId}${labelsPdfExtension}`;
      
      try {
        const blob = await put(labelsPdfFilename, labelsPdf.buffer, {
          access: 'public',
          contentType: labelsPdf.mimetype,
        });
        labelsPdfUrl = blob.url;
        console.log(`Labels PDF uploaded: ${labelsPdfFilename}`);
      } catch (error) {
        console.error(`Failed to upload labels PDF: ${error.message}`);
        throw new Error(`Failed to upload labels PDF: ${error.message}`);
      }
    } else {
      console.log('No labels PDF uploaded');
    }

    console.log('Image URLs:', imageUrls);
    console.log('PDF URLs:', pdfUrls);
    console.log('Labels PDF URL:', labelsPdfUrl);

    const allImageUrls = [...imageUrls];
    if (labelsPdfUrl) {
      allImageUrls.push(labelsPdfUrl);
    }

    console.log('=== LAMATIC API CALL ===');
    
    const lamaticApiKey = process.env.LAMATIC_API_KEY;
    const workflowId = process.env.LAMATIC_WORKFLOW_ID;
    const projectId = process.env.LAMATIC_PROJECT_ID;
    const lamaticApiUrl = process.env.LAMATIC_API_URL;

    if (!lamaticApiKey || !workflowId || !projectId || !lamaticApiUrl) {
      throw new Error('Lamatic API key, workflow ID, project ID, or API URL is missing. Check environment variables.');
    }

    const graphqlQuery = `
      query executeWorkflow(
        $workflowId: String!
        $imageurl: [String]
        $coaurl: [String]
        $labelurl: [String]
        $jurisdictions: [String]
        $date: String
        $time: String
        $company_name: String
        $product_type: String
      ) {
        executeWorkflow(
          workflowId: $workflowId
          payload: {
            imageurl: $imageurl
            coaurl: $coaurl
            labelurl: $labelurl
            jurisdictions: $jurisdictions
            date: $date
            time: $time
            company_name: $company_name
            product_type: $product_type
          }
        ) {
          status
          result
        }
      }
    `;

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US');
    const timeStr = now.toLocaleTimeString('en-US');
    const companyName = req.body.company_name || 'N/A';
    const productType = req.body.product_type || 'N/A';

    console.log('API URL:', lamaticApiUrl);
    console.log('Workflow ID:', workflowId);
    console.log('Project ID:', projectId);
    console.log('API Key (first 10 chars):', lamaticApiKey?.substring(0, 10) + '...');
    
    const requestPayload = {
      query: graphqlQuery,
      variables: {
        workflowId: workflowId,
        imageurl: imageUrls,
        jurisdictions: jurisdictions,
        coaurl: pdfUrls.length > 0 ? pdfUrls : ["https://cdn.shopify.com/s/files/1/0665/8188/9159/files/Blueberry_-_Mega_Smasher_s.pdf?v=1764824884"],
        labelurl: allImageUrls,
        date: dateStr,
        time: timeStr,
        company_name: companyName,
        product_type: productType
      }
    };
    
    console.log('Request Payload:', JSON.stringify(requestPayload).substring(0, 500) + '...');

    const response = await axios.post(lamaticApiUrl, requestPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lamaticApiKey}`,
        'x-project-id': projectId
      },
      timeout: 60000,
      validateStatus: () => true // Don't throw on any status code
    });

    console.log('Lamatic API Response Status:', response.status);
    console.log('Lamatic API Response Headers:', response.headers);
    console.log('Lamatic API Response Body:', JSON.stringify(response.data, null, 2));

    if (response.status !== 200) {
      throw new Error(`Lamatic API returned ${response.status}: ${JSON.stringify(response.data)}`);
    }

    if (response.data.errors) {
      throw new Error(`Lamatic API Error: ${response.data.errors[0]?.message}`);
    }

    const result = response.data.data?.executeWorkflow?.result;

    console.log('Full executeWorkflow result:', JSON.stringify(result, null, 2));

    if (!result) {
      throw new Error('No output from Lamatic API');
    }

    // Get requestId for polling
    const requestId = result.requestId;
    if (!requestId) {
      throw new Error('No requestId returned from Lamatic - cannot poll for results');
    }

    console.log('Workflow submitted with requestId:', requestId);
    
    // Return immediately with requestId - client will poll for results
    res.json({
      success: true,
      status: 'pending',
      requestId: requestId,
      message: 'Compliance check submitted. Please wait for results.'
    });

  } catch (error) {
    console.error('Error processing compliance check:', error);
    
    res.status(500).json({
      error: error.response?.data?.errors?.[0]?.message || error.message || 'An error occurred while processing your request'
    });
  }
});

// API endpoint to check workflow results
app.get('/api/results/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const lamaticApiKey = process.env.LAMATIC_API_KEY;
    const projectId = process.env.LAMATIC_PROJECT_ID;
    const lamaticApiUrl = process.env.LAMATIC_API_URL;

    if (!lamaticApiKey || !projectId || !lamaticApiUrl || !requestId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const getResultQuery = `
      query checkStatus($request_id: String!) {
        checkStatus(requestId: $request_id)
      }
    `;

    console.log(`Checking results for requestId: ${requestId}`);

    const pollResponse = await axios.post(lamaticApiUrl, {
      query: getResultQuery,
      variables: { request_id: requestId }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lamaticApiKey}`,
        'x-project-id': projectId
      },
      timeout: 60000,
      validateStatus: () => true
    });

    console.log(`Results check Status:`, pollResponse.status);
    
    const pollResult = pollResponse.data.data?.checkStatus;
    console.log(`Full pollResponse.data:`, JSON.stringify(pollResponse.data, null, 2));
    console.log(`Results check Result:`, JSON.stringify(pollResult, null, 2));

    if (pollResponse.status === 200 && pollResult) {
      // Lamatic returns the result directly from checkStatus
      return res.json({
        success: true,
        status: 'success',
        ...pollResult
      });
    }

    res.status(pollResponse.status).json({
      error: 'Failed to check workflow results',
      details: pollResponse.data
    });

  } catch (error) {
    console.error('Error checking results:', error);
    res.status(500).json({
      error: error.message || 'An error occurred while checking results'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
