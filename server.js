require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

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

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

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

    const images = req.files.images;
    const pdf = req.files.pdf[0];

    // Generate URLs for uploaded files
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const imageUrls = images.map(img => `${baseUrl}/uploads/${img.filename}`);
    const pdfUrl = `${baseUrl}/uploads/${pdf.filename}`;

    console.log('Image URLs:', imageUrls);
    console.log('PDF URL:', pdfUrl);

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
    const response = await axios(options);

    console.log('Lamatic API response:', JSON.stringify(response.data, null, 2));

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

    // Clean up uploaded files after processing (optional)
    // Uncomment the following lines if you want to delete files after processing
    /*
    setTimeout(() => {
      images.forEach(img => {
        fs.unlink(path.join(uploadsDir, img.filename), (err) => {
          if (err) console.error('Error deleting image:', err);
        });
      });
      fs.unlink(path.join(uploadsDir, pdf.filename), (err) => {
        if (err) console.error('Error deleting PDF:', err);
      });
    }, 60000); // Delete after 1 minute
    */

    res.json({
      status: workflowResult.status,
      result: responseData
    });

  } catch (error) {
    console.error('Error processing compliance check:', error);
    
    // Clean up files on error
    if (req.files) {
      if (req.files.images) {
        req.files.images.forEach(img => {
          fs.unlink(path.join(uploadsDir, img.filename), () => {});
        });
      }
      if (req.files.pdf) {
        fs.unlink(path.join(uploadsDir, req.files.pdf[0].filename), () => {});
      }
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

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
