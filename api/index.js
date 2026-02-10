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

// In-memory chunk storage: { uploadId: { chunks: [Buffer, Buffer...], metadata: {...} } }
const chunkStorage = new Map();
const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks (safe margin for Vercel 6MB limit)

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
app.use(express.urlencoded({ limit: '10mb', extended: true }));

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
      // Check if this is a success response
      if (pollResult.success && pollResult.status === 'success') {
        // Extract the actual result from nested structure
        const actualResult = pollResult.data?.output?.result || pollResult.data;
        return res.json({
          success: true,
          status: 'success',
          data: actualResult
        });
      }
      // Still in progress or other status
      return res.json({
        success: false,
        status: pollResult.status || 'in-progress',
        message: 'Still processing...'
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

// **CHUNKED FILE UPLOAD ENDPOINTS**

// Upload a single file chunk - use raw middleware to minimize overhead
app.post('/api/upload-chunk', express.raw({ type: '*/*', limit: '10mb' }), (req, res) => {
  try {
    const uploadId = req.headers['x-upload-id'];
    const chunkIndex = parseInt(req.headers['x-chunk-index']);
    const totalChunks = parseInt(req.headers['x-total-chunks']);
    const fileName = req.headers['x-file-name'];
    const fileType = req.headers['x-file-type'];
    
    if (!uploadId || chunkIndex === undefined || !totalChunks || !fileName) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const chunk = req.body;
    if (!chunk || chunk.length === 0) {
      return res.status(400).json({ error: 'No chunk data provided' });
    }

    console.log(`Received chunk ${chunkIndex}/${totalChunks} for upload ${uploadId}, size: ${chunk.length} bytes`);

    // Initialize storage for this upload if needed
    if (!chunkStorage.has(uploadId)) {
      chunkStorage.set(uploadId, {
        chunks: new Array(totalChunks).fill(null),
        metadata: { fileName, fileType, totalChunks: totalChunks, receivedChunks: 0 },
        createdAt: Date.now()
      });
    }

    const uploadData = chunkStorage.get(uploadId);
    
    // Store this chunk
    if (uploadData.chunks[chunkIndex] !== null) {
      return res.status(400).json({ error: `Chunk ${chunkIndex} already uploaded` });
    }

    uploadData.chunks[chunkIndex] = chunk;
    uploadData.metadata.receivedChunks++;

    console.log(`Stored chunk ${chunkIndex}. Progress: ${uploadData.metadata.receivedChunks}/${totalChunks}`);

    res.json({
      success: true,
      uploadId,
      chunkIndex: chunkIndex,
      receivedChunks: uploadData.metadata.receivedChunks,
      totalChunks: totalChunks,
      progress: Math.round((uploadData.metadata.receivedChunks / totalChunks) * 100)
    });

  } catch (error) {
    console.error('Error uploading chunk:', error);
    res.status(500).json({ error: error.message || 'Failed to upload chunk' });
  }
});

// Finalize chunked upload and assemble file
app.post('/api/finalize-chunks', express.json(), async (req, res) => {
  try {
    const { uploadId, fileType } = req.body;

    if (!uploadId) {
      return res.status(400).json({ error: 'Missing uploadId' });
    }

    const uploadData = chunkStorage.get(uploadId);
    if (!uploadData) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    const { chunks, metadata } = uploadData;
    const { fileName, totalChunks, receivedChunks } = metadata;

    console.log(`Finalizing upload ${uploadId}: ${receivedChunks}/${totalChunks} chunks`);

    // Check if all chunks received
    if (receivedChunks !== totalChunks) {
      return res.status(400).json({ 
        error: `Not all chunks received. Got ${receivedChunks}/${totalChunks}` 
      });
    }

    // Verify all chunks exist
    if (chunks.some(chunk => chunk === null)) {
      return res.status(400).json({ error: 'Some chunks are missing' });
    }

    // Assemble chunks
    console.log('Assembling chunks...');
    const assembledBuffer = Buffer.concat(chunks);
    console.log(`Assembled buffer size: ${assembledBuffer.length} bytes`);

    // Upload to Vercel Blob
    const blobFileName = `${fileType}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${fileName}`;
    console.log(`Uploading to Vercel Blob: ${blobFileName}`);

    const blob = await put(blobFileName, assembledBuffer, {
      access: 'public',
      contentType: 'application/pdf'
    });

    console.log(`File uploaded to Blob: ${blob.url}`);

    // Clean up chunks from memory
    chunkStorage.delete(uploadId);

    res.json({
      success: true,
      uploadId,
      url: blob.url,
      fileName: blobFileName,
      size: assembledBuffer.length
    });

  } catch (error) {
    console.error('Error finalizing chunks:', error);
    // Clean up on error
    if (req.body.uploadId) {
      chunkStorage.delete(req.body.uploadId);
    }
    res.status(500).json({ error: error.message || 'Failed to finalize upload' });
  }
});

// API endpoint for compliance check with pre-uploaded URLs
app.post('/api/check-compliance-urls', apiLimiter, express.json(), async (req, res) => {
  try {
    const { imageurl, coaurl, labelurl, jurisdictions, date, time, company_name, product_type } = req.body;

    if (!imageurl || imageurl.length === 0) {
      return res.status(400).json({ error: 'At least one image is required' });
    }

    if (!jurisdictions || jurisdictions.length === 0) {
      return res.status(400).json({ error: 'At least one jurisdiction is required' });
    }

    const lamaticApiKey = process.env.LAMATIC_API_KEY;
    const workflowId = process.env.LAMATIC_WORKFLOW_ID;
    const projectId = process.env.LAMATIC_PROJECT_ID;
    const lamaticApiUrl = process.env.LAMATIC_API_URL;

    if (!lamaticApiKey || !workflowId || !projectId || !lamaticApiUrl) {
      return res.status(500).json({ error: 'Missing Lamatic configuration' });
    }

    // Ensure jurisdictions is an array
    let jurisdictionsArray = Array.isArray(jurisdictions) ? jurisdictions : [jurisdictions];

    console.log('=== LAMATIC API CALL ===');
    console.log('Image URLs:', imageurl);
    console.log('COA URLs:', coaurl);
    console.log('Label URLs:', labelurl);
    console.log('Jurisdictions:', jurisdictionsArray);

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

    const requestPayload = {
      query: graphqlQuery,
      variables: {
        workflowId: workflowId,
        imageurl: Array.isArray(imageurl) ? imageurl : [imageurl],
        coaurl: coaurl || [],
        labelurl: labelurl || [],
        jurisdictions: jurisdictionsArray,
        date: date || new Date().toLocaleDateString(),
        time: time || new Date().toLocaleTimeString(),
        company_name: company_name || 'N/A',
        product_type: product_type || 'N/A'
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
      validateStatus: () => true
    });

    console.log('Lamatic API Response Status:', response.status);
    console.log('Lamatic API Response Body:', JSON.stringify(response.data, null, 2));

    if (response.status !== 200) {
      throw new Error(`Lamatic API returned ${response.status}: ${JSON.stringify(response.data)}`);
    }

    if (response.data.errors) {
      throw new Error(`Lamatic API Error: ${response.data.errors[0]?.message}`);
    }

    const result = response.data.data?.executeWorkflow?.result;

    if (!result) {
      throw new Error('No output from Lamatic API');
    }

    // Get requestId for polling
    const requestId = result.requestId;
    if (!requestId) {
      throw new Error('No requestId returned from Lamatic - cannot poll for results');
    }

    console.log('Workflow submitted with requestId:', requestId);

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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
