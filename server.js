require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Supabase bucket name
const BUCKET_NAME = 'cannacore';

// Utility function to delete file from Supabase bucket
async function deleteFileFromSupabase(fileName) {
  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([fileName]);

    if (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }

    return true;
  } catch (error) {
    console.error(`[SUPABASE] Delete error for ${fileName}:`, error.message);
    return false;
  }
}

// Track uploaded files by requestId for cleanup
const uploadedFilesMap = new Map();
const FILES_CLEANUP_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

// Convert PDF pages to images using mupdf
async function convertPdfToImages(pdfBuffer) {
  try {
    // Dynamically import mupdf (ES module)
    const mupdf = await import('mupdf');
    const imageUrls = [];

    // Open PDF document with mupdf
    const doc = mupdf.default.Document.openDocument(pdfBuffer, 'application/pdf');
    const pageCount = doc.countPages();

    console.log(`Converting ${pageCount} PDF pages to images...`);

    for (let pageNum = 0; pageNum < pageCount; pageNum++) {
      try {
        const page = doc.loadPage(pageNum);

        // Render page to pixmap at 2x scale (144 DPI)
        const scaleFactor = 2;
        const matrix = mupdf.default.Matrix.scale(scaleFactor, scaleFactor);
        const pixmap = page.toPixmap(matrix, mupdf.default.ColorSpace.DeviceRGB, false, true);
        
        // Convert pixmap to PNG buffer
        let imageBuffer = pixmap.asPNG();

        // Compress image using sharp
        imageBuffer = await sharp(Buffer.from(imageBuffer))
          .png({ compressionLevel: 9 })
          .toBuffer();

        // Generate unique filename
        const uniqueImageId = crypto.randomUUID();
        const imageFilename = `pdf-pages/${uniqueImageId}-page-${pageNum + 1}.png`;
        const imagePath = `images/${imageFilename}`;

        // Upload to Supabase
        const { data: imageData, error: imageError } = await supabase.storage
          .from('cannacore')
          .upload(imagePath, imageBuffer, {
            contentType: 'image/png'
          });

        if (imageError) {
          throw new Error(`Failed to upload page image: ${imageError.message}`);
        }

        // Get public URL
        const { data: imageUrlData } = supabase.storage
          .from('cannacore')
          .getPublicUrl(imagePath);

        imageUrls.push(imageUrlData.publicUrl);
        console.log(`Page ${pageNum + 1}/${pageCount} uploaded: ${imageFilename} (${(imageBuffer.length / 1024).toFixed(0)} KB)`);
      } catch (pageError) {
        console.error(`Error converting page ${pageNum + 1}:`, pageError);
        throw new Error(`Failed to convert page ${pageNum + 1}: ${pageError.message}`);
      }
    }

    return imageUrls;
  } catch (error) {
    console.error('Error converting PDF to images:', error);
    throw new Error(`Failed to convert PDF to images: ${error.message}`);
  }
}

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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

// In-memory chunk storage: { uploadId: { chunks: Map, metadata: {...} } }
const chunkStorage = new Map();
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
const UPLOAD_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// Periodically clean up old uploads
setInterval(() => {
  const now = Date.now();
  for (const [uploadId, uploadData] of chunkStorage.entries()) {
    if (now - uploadData.createdAt > UPLOAD_TIMEOUT) {
      console.log(`Cleaning up expired upload: ${uploadId}`);
      chunkStorage.delete(uploadId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

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

// Chunk upload endpoint - receives file chunks
app.post('/api/upload-chunk', express.raw({ type: 'application/octet-stream', limit: '50mb' }), (req, res) => {
  try {
    const uploadId = req.headers['x-upload-id'];
    const chunkIndex = parseInt(req.headers['x-chunk-index']);
    const totalChunks = parseInt(req.headers['x-total-chunks']);
    const fileName = req.headers['x-file-name'];
    const fileType = req.headers['x-file-type'];

    if (!uploadId || chunkIndex === undefined || !totalChunks || !fileName || !fileType) {
      return res.status(400).json({ error: 'Missing required headers' });
    }

    // Initialize upload storage if needed
    if (!chunkStorage.has(uploadId)) {
      chunkStorage.set(uploadId, {
        chunks: new Map(),
        metadata: {
          totalChunks,
          fileName,
          fileType,
          createdAt: Date.now()
        }
      });
    }

    const uploadData = chunkStorage.get(uploadId);

    // Store the chunk (req.body is already a Buffer from express.raw)
    uploadData.chunks.set(chunkIndex, req.body);
    
    const receivedChunks = uploadData.chunks.size;
    const progress = Math.round((receivedChunks / totalChunks) * 100);

    console.log(`Chunk ${chunkIndex + 1}/${totalChunks} received for upload ${uploadId} (${fileName}). Progress: ${progress}%`);

    res.json({
      success: true,
      uploadId,
      chunkIndex,
      progress,
      message: `Chunk ${chunkIndex + 1} of ${totalChunks} received`
    });
  } catch (error) {
    console.error('Error processing chunk:', error);
    res.status(500).json({ error: error.message });
  }
});

// Finalize upload - combine chunks and upload to Supabase
app.post('/api/finalize-chunks', async (req, res) => {
  try {
    const { uploadId, fileType } = req.body;

    if (!uploadId || !fileType) {
      return res.status(400).json({ error: 'Missing uploadId or fileType' });
    }

    const uploadData = chunkStorage.get(uploadId);
    if (!uploadData) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    const { chunks, metadata } = uploadData;
    const { totalChunks, fileName } = metadata;

    // Check if all chunks are received
    if (chunks.size !== totalChunks) {
      const missingChunks = [];
      for (let i = 0; i < totalChunks; i++) {
        if (!chunks.has(i)) {
          missingChunks.push(i);
        }
      }
      return res.status(400).json({
        error: 'Not all chunks received',
        missingChunks,
        receivedChunks: chunks.size,
        totalChunks
      });
    }

    // Combine chunks in order
    const buffers = [];
    for (let i = 0; i < totalChunks; i++) {
      buffers.push(chunks.get(i));
    }
    const fileBuffer = Buffer.concat(buffers);

    console.log(`Combined file size: ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB`);

    // Determine file type and handle accordingly
    let uploadedUrls = [];

    if (fileType === 'images') {
      // Upload image directly to Supabase
      const uniqueId = crypto.randomUUID();
      const imagePath = `images/${uniqueId}-${fileName}`;

      const { data: imageData, error: imageError } = await supabase.storage
        .from('cannacore')
        .upload(imagePath, fileBuffer, {
          contentType: 'image/*'
        });

      if (imageError) {
        throw new Error(`Failed to upload image: ${imageError.message}`);
      }

      const { data: imageUrlData } = supabase.storage
        .from('cannacore')
        .getPublicUrl(imagePath);

      uploadedUrls = [imageUrlData.publicUrl];
      console.log(`Image uploaded: ${imagePath}`);

    } else if (fileType === 'pdfs') {
      // Upload COA PDF directly to Supabase (no conversion)
      console.log('Uploading COA PDF directly...');
      const uniqueId = crypto.randomUUID();
      const pdfPath = `pdfs/${uniqueId}-${metadata.fileName}`;

      const { data: pdfData, error: pdfError } = await supabase.storage
        .from('cannacore')
        .upload(pdfPath, fileBuffer, {
          contentType: 'application/pdf'
        });

      if (pdfError) {
        throw new Error(`Failed to upload COA PDF: ${pdfError.message}`);
      }

      const { data: pdfUrlData } = supabase.storage
        .from('cannacore')
        .getPublicUrl(pdfPath);

      uploadedUrls = [pdfUrlData.publicUrl];
      console.log(`COA PDF uploaded: ${pdfPath} (${(fileBuffer.length / 1024).toFixed(0)} KB)`);

    } else if (fileType === 'labels-pdfs') {
      // Convert labels PDF to images
      console.log('Converting labels PDF to images...');
      uploadedUrls = await convertPdfToImages(fileBuffer);
    }

    // Clean up the chunks
    chunkStorage.delete(uploadId);

    res.json({
      success: true,
      urls: uploadedUrls,
      pageCount: uploadedUrls.length,
      message: `File uploaded successfully`
    });

  } catch (error) {
    console.error('Error finalizing upload:', error);
    res.status(500).json({ error: error.message });
  }
});

// Compliance check endpoint - accepts pre-uploaded URLs
app.post('/api/check-compliance-urls', apiLimiter, async (req, res) => {
  try {
    const { imageurl, coaurl, jurisdictions } = req.body;

    // Validate inputs
    if (!imageurl || !Array.isArray(imageurl) || imageurl.length === 0) {
      return res.status(400).json({
        error: 'Please provide at least one image URL'
      });
    }

    console.log('=== COMPLIANCE CHECK WITH URLS ===');
    console.log('Image URLs:', imageurl);
    console.log('COA URLs:', coaurl);
    console.log('Jurisdictions:', jurisdictions);

    // Prepare Lamatic API request
    const lamatic_api_key = process.env.LAMATIC_API_KEY;
    const lamatic_api_url = process.env.LAMATIC_API_URL;
    const lamatic_workflow_id = process.env.LAMATIC_WORKFLOW_ID;
    const lamatic_project_id = process.env.LAMATIC_PROJECT_ID;

    if (!lamatic_api_key) {
      return res.status(500).json({
        error: 'LAMATIC_API_KEY is not configured'
      });
    }

    if (!lamatic_api_url || !lamatic_workflow_id || !lamatic_project_id) {
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
      "imageurl": imageurl,
      "coaurl": Array.isArray(coaurl) ? coaurl : (coaurl ? [coaurl] : []),
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
    console.log('===========================');
    console.log('Calling Lamatic API...');
    
    const response = await axios(options);

    console.log('Lamatic API response:', JSON.stringify(response.data, null, 2));

    // Extract the result from the API response
    const workflowResult = response.data?.data?.executeWorkflow;

    if (!workflowResult) {
      return res.status(500).json({
        error: 'Invalid response from Lamatic API'
      });
    }

    // Get requestId for async polling
    const requestId = workflowResult.requestId || workflowResult?.result?.requestId;
    
    if (!requestId) {
      console.error('No requestId in response');
      return res.status(500).json({
        error: 'No requestId returned from Lamatic'
      });
    }

    // Store uploaded file paths for cleanup after results are received
    // Extract Supabase storage paths from public URLs
    const extractFilePath = (url) => {
      if (!url) return null;
      const match = url.match(/\/cannacore\/(.+)$/);
      return match ? match[1] : null;
    };

    const imageFilePaths = (imageurl || []).map(extractFilePath).filter(Boolean);
    const coaFilePaths = (Array.isArray(coaurl) ? coaurl : (coaurl ? [coaurl] : [])).map(extractFilePath).filter(Boolean);

    if (imageFilePaths.length > 0 || coaFilePaths.length > 0) {
      uploadedFilesMap.set(requestId, {
        imageFilePaths,
        coaFilePaths,
        createdAt: Date.now()
      });
      console.log(`[UPLOAD TRACKING] Stored ${imageFilePaths.length} image paths and ${coaFilePaths.length} COA paths for requestId: ${requestId}`);
    }

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

// Polling endpoint - check compliance results by requestId
app.get('/api/results/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;

    if (!requestId) {
      return res.status(400).json({
        error: 'Missing requestId parameter'
      });
    }

    console.log(`Checking status for requestId: ${requestId}`);

    // Prepare Lamatic API request to check status
    const lamatic_api_key = process.env.LAMATIC_API_KEY;
    const lamatic_api_url = process.env.LAMATIC_API_URL;
    const lamatic_project_id = process.env.LAMATIC_PROJECT_ID;

    if (!lamatic_api_key || !lamatic_api_url || !lamatic_project_id) {
      return res.status(500).json({
        error: 'Lamatic API configuration is incomplete'
      });
    }

    const query = `
      query CheckStatus($request_id: String!) {
        checkStatus(requestId: $request_id)
      }`;

    const variables = {
      "request_id": requestId
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

    console.log(`Polling Lamatic for requestId: ${requestId}`);
    
    const response = await axios(options);
    console.log('Full Lamatic checkStatus response:', JSON.stringify(response.data, null, 2));
    
    // Check if there's an error in the response
    if (response.data?.errors && response.data.errors.length > 0) {
      console.error('Lamatic returned errors:', response.data.errors);
      return res.status(500).json({
        error: response.data.errors[0]?.message || 'Lamatic API error',
        status: 'error'
      });
    }

    // checkStatus returns JSON directly (not an object with subfields)
    const checkStatusResult = response.data?.data?.checkStatus;

    if (checkStatusResult === null || checkStatusResult === undefined) {
      console.error('No checkStatus in response. Response structure:', JSON.stringify(response.data, null, 2));
      return res.status(500).json({
        error: 'Invalid response from Lamatic API - no checkStatus field',
        status: 'error',
        receivedData: response.data
      });
    }

    console.log(`Status check result:`, JSON.stringify(checkStatusResult, null, 2));

    // checkStatusResult is the actual JSON result object
    // Check if it has required data
    const isComplete = checkStatusResult?.completion_status === 'success' || 
                       checkStatusResult?.status === 'success' ||
                       checkStatusResult?.status === 'completed';
    
    const hasFailed = checkStatusResult?.completion_status === 'failed' || 
                      checkStatusResult?.status === 'failed' ||
                      checkStatusResult?.status === 'error';

    if (isComplete) {
        // Extract the actual compliance result from the nested Lamatic response
        // checkStatusResult structure: { data: { output: { result: { compliance_check, ... } } }, status }
        const actualResult = checkStatusResult?.data?.output?.result || 
                             checkStatusResult?.output?.result ||
                             checkStatusResult?.data?.output ||
                             checkStatusResult;

        console.log('Extracted actualResult keys:', Object.keys(actualResult || {}));

        // Delete uploaded files from Supabase after processing
        setImmediate(async () => {
          try {
            const uploadedData = uploadedFilesMap.get(requestId);
            if (uploadedData) {
              const filePaths = [
                ...uploadedData.imageFilePaths,
                ...uploadedData.coaFilePaths
              ].filter(path => path);
              
              if (filePaths.length > 0) {
                console.log(`[CLEANUP] Deleting ${filePaths.length} files for requestId ${requestId}...`);
                
                for (const filePath of filePaths) {
                  try {
                    await deleteFileFromSupabase(filePath);
                    console.log(`[CLEANUP] Deleted: ${filePath}`);
                  } catch (err) {
                    console.error(`[CLEANUP] Failed to delete ${filePath}:`, err.message);
                  }
                }
                
                uploadedFilesMap.delete(requestId);
                console.log('[CLEANUP] Done');
              }
            }
          } catch (cleanupErr) {
            console.error('[CLEANUP] Error:', cleanupErr.message);
          }
        });

      return res.json({
        success: true,
        status: 'success',
        data: {
          output: {
            result: actualResult
          }
        }
      });
    } else if (hasFailed) {
      return res.json({
        success: false,
        status: 'failed',
        error: checkStatusResult?.error || checkStatusResult?.message || 'Workflow failed'
      });
    } else {
      // Still processing
      return res.json({
        success: true,
        status: 'processing',
        message: 'Still processing, please wait...'
      });
    }

  } catch (error) {
    console.error('Error checking compliance status:', error);
    
    res.status(500).json({
      error: error.response?.data?.errors?.[0]?.message || error.message || 'An error occurred while checking status',
      status: 'error'
    });
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
    
    for (const image of images) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const imageFilename = `image-${uniqueSuffix}${path.extname(image.originalname)}`;
      const imagePath = `images/${imageFilename}`;
      
      const { data: imageData, error: imageError } = await supabase.storage
        .from('cannacore')
        .upload(imagePath, image.buffer, {
          contentType: image.mimetype
        });
      
      if (imageError) {
        throw new Error(`Failed to upload image: ${imageError.message}`);
      }
      
      // Get public URL
      const { data: imageUrlData } = supabase.storage
        .from('cannacore')
        .getPublicUrl(imagePath);
      
      imageUrls.push(imageUrlData.publicUrl);
      uploadedImagePaths.push(imagePath);
    }

    // Convert PDF to images and upload them
    const uniquePdfSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const pdfFilename = `pdf-${uniquePdfSuffix}.pdf`;
    const pdfPath = `pdfs/${pdfFilename}`;
    
    console.log('Converting PDF to images...');
    const pdfPageUrls = await convertPdfToImages(pdf.buffer);
    
    // Add PDF page images to the image URLs array
    imageUrls.push(...pdfPageUrls);
    
    // Note: We don't upload the raw PDF, just the converted page images
    const allUploadedPaths = uploadedImagePaths;

    console.log('Image URLs:', imageUrls);
    console.log('Total images to process (including PDF pages):', imageUrls.length);

    // Prepare Lamatic API request
    const lamatic_api_key = process.env.LAMATIC_API_KEY;
    const lamatic_api_url = process.env.LAMATIC_API_URL;
    const lamatic_workflow_id = process.env.LAMATIC_WORKFLOW_ID;
    const lamatic_project_id = process.env.LAMATIC_PROJECT_ID;

    if (!lamatic_api_key) {
      return res.status(500).json({
        error: 'LAMATIC_API_KEY is not configured'
      });
    }

    if (!lamatic_api_url || !lamatic_workflow_id || !lamatic_project_id) {
      return res.status(500).json({
        error: 'Lamatic API configuration is incomplete. Please check environment variables.'
      });
    }

    const query = `
      query ExecuteWorkflow(
        $workflowId: String!
        $imageurl: [String]
      ) {
        executeWorkflow(
          workflowId: $workflowId
          payload: {
            imageurl: $imageurl
          }
        ) {
          status
          result
        }
      }`;

    const variables = {
      "workflowId": lamatic_workflow_id,
      "imageurl": imageUrls
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
    try {
      response = await axios(options);
      
      console.log('Lamatic API response:', JSON.stringify(response.data, null, 2));

      // Extract the result from the API response
      const workflowResult = response.data?.data?.executeWorkflow;

      if (!workflowResult) {
        return res.status(500).json({
          error: 'Invalid response from Lamatic API'
        });
      }

      // Get requestId for polling async results
      const requestId = workflowResult.requestId || workflowResult?.result?.requestId;
      
      if (!requestId) {
        console.error('No requestId in response, cannot poll for results');
        return res.status(500).json({
          error: 'No requestId returned from Lamatic - cannot poll for results'
        });
      }

      console.log('Starting polling for results with requestId:', requestId);

      // Poll for results with exponential backoff
      const maxWaitTime = 55000; // 55 seconds
      const maxPolls = 30;
      let pollCount = 0;
      let finalResult = null;
      const startTime = Date.now();

      const getResultQuery = `
        query getWorkflowResult($requestId: String!) {
          getWorkflowResult(requestId: $requestId) {
            status
            result
          }
        }
      `;

      while (pollCount < maxPolls && (Date.now() - startTime) < maxWaitTime) {
        pollCount++;
        const delay = Math.min(1000 * pollCount, 5000); // Exponential backoff
        console.log(`Poll ${pollCount}: Waiting ${delay}ms before checking results...`);
        await new Promise(resolve => setTimeout(resolve, delay));

        const pollResponse = await axios.post(lamatic_api_url, {
          query: getResultQuery,
          variables: { requestId: requestId }
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${lamatic_api_key}`,
            'x-project-id': lamatic_project_id
          },
          timeout: 60000,
          validateStatus: () => true
        });

        console.log(`Poll ${pollCount} Response Status:`, pollResponse.status);

        const pollResult = pollResponse.data.data?.getWorkflowResult;
        console.log(`Poll ${pollCount} Result:`, JSON.stringify(pollResult, null, 2));

        if (pollResponse.status === 200 && pollResult) {
          if (pollResult.status === 'success' && pollResult.result) {
            console.log('Results ready! Stopping polls.');
            finalResult = pollResult.result;
            break;
          } else if (pollResult.status === 'failed' || pollResult.status === 'error') {
            throw new Error(`Lamatic workflow failed: ${pollResult.status}`);
          }
          console.log(`Poll ${pollCount}: Status is ${pollResult.status}, continuing...`);
        }
      }

      if (!finalResult) {
        throw new Error(`Lamatic workflow did not complete within ${maxWaitTime}ms (${pollCount} polls)`);
      }

      console.log('Final parsed result:', JSON.stringify(finalResult, null, 2));

      // Parse the result if it's a string
      let result;
      if (typeof finalResult === 'string') {
        try {
          result = JSON.parse(finalResult);
        } catch (e) {
          result = finalResult;
        }
      } else {
        result = finalResult;
      }

      // Handle nested output structure
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

    } finally {
      // Cleanup files from Supabase after API call (whether success or failure)
      console.log('Cleaning up files from Supabase...');
      await supabase.storage
        .from('cannacore')
        .remove(allUploadedPaths);
    }

  } catch (error) {
    console.error('Error processing compliance check:', error);
    
    // Attempt cleanup on error
    try {
      await supabase.storage
        .from('cannacore')
        .remove(allUploadedPaths);
    } catch (cleanupError) {
      console.error('Failed to cleanup files:', cleanupError);
    }
    
    res.status(500).json({
      error: error.response?.data?.errors?.[0]?.message || error.message || 'An error occurred while processing your request'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Clean up old entries from uploadedFilesMap periodically
setInterval(() => {
  const now = Date.now();
  for (const [requestId, data] of uploadedFilesMap.entries()) {
    if (now - data.createdAt > FILES_CLEANUP_TIMEOUT) {
      console.log(`[CLEANUP] Removing stale entry from map: ${requestId}`);
      uploadedFilesMap.delete(requestId);
    }
  }
}, 60 * 60 * 1000); // Check every hour

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
