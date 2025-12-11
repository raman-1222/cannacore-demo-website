# Cannabis Compliance Checker

A web application for checking cannabis product compliance by uploading product images and Certificate of Analysis (COA) PDF files. The application uses the Lamatic API to analyze the uploaded content and provide detailed compliance reports.

## Features

- **Multiple Image Upload**: Upload multiple product images with drag-and-drop support
- **PDF Upload**: Upload Certificate of Analysis (COA) documents
- **Compliance Analysis**: Get detailed compliance reports with compliant and non-compliant items
- **Modern UI**: Clean, responsive design with visual feedback
- **Real-time Preview**: See previews of uploaded images before submission

## Technology Stack

- **Backend**: Node.js with Express
- **Frontend**: HTML, CSS, Vanilla JavaScript
- **File Handling**: Multer for multipart form data
- **HTTP Client**: Axios for API calls
- **Environment Variables**: dotenv for configuration

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- Lamatic API key

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/raman-1222/cannacore-demo-website.git
   cd cannacore-demo-website
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
   
   Edit the `.env` file and add your Lamatic API key:
   ```
   LAMATIC_API_KEY=your_api_key_here
   PORT=3000
   ```

## Usage

1. **Start the server**
   ```bash
   npm start
   ```
   
   For development with auto-restart:
   ```bash
   npm run dev
   ```

2. **Access the application**
   
   Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

3. **Upload files**
   - Click or drag-and-drop multiple product images in the Image Upload section
   - Click or drag-and-drop a PDF Certificate of Analysis in the PDF Upload section
   - Click "Check Compliance" to submit for analysis

4. **View results**
   - Compliant items will be displayed in green cards
   - Non-compliant items will be displayed in red cards with:
     - Reason for non-compliance
     - Evidence from the analysis
     - Suggested fixes

## API Configuration

The application uses the Lamatic GraphQL API with the following configuration:

- **Endpoint**: `https://cannacore824-cannacore872.lamatic.dev/graphql`
- **Workflow ID**: `72552416-8242-4ee3-bbb8-235d7792dd63`
- **Project ID**: `d00a8d95-9196-45f3-8488-10ead508b5f5`

## File Structure

```
cannacore-demo-website/
├── server.js              # Express server with API routes
├── public/
│   ├── index.html         # Main HTML page
│   ├── styles.css         # Styling
│   └── script.js          # Frontend JavaScript
├── uploads/               # Temporary file storage (gitignored)
├── package.json           # Dependencies and scripts
├── .env.example           # Environment variable template
├── .gitignore             # Git ignore rules
└── README.md              # This file
```

## API Endpoints

### POST `/api/check-compliance`

Uploads images and PDF for compliance checking.

**Request**: Multipart form data
- `images`: Multiple image files (max 10)
- `pdf`: Single PDF file

**Response**:
```json
{
  "status": "success",
  "result": {
    "compliant_items": [
      {
        "summary": "Description of compliant item"
      }
    ],
    "non_compliant_items": [
      {
        "reason": "Reason for non-compliance",
        "evidence": "Evidence from analysis",
        "suggested_fix": "Suggested fix"
      }
    ]
  }
}
```

### GET `/api/health`

Health check endpoint.

**Response**:
```json
{
  "status": "ok"
}
```

## Error Handling

The application handles various error scenarios:
- Missing files
- Invalid file types
- File size limits (10MB per file)
- API connection errors
- Invalid API responses

Errors are displayed in a user-friendly format with clear messages.

## Development

To run in development mode with auto-restart:

```bash
npm run dev
```

## Security Notes

- Never commit your `.env` file or API keys to version control
- The `uploads/` directory is gitignored to prevent temporary files from being committed
- Files are stored temporarily and can be automatically cleaned up after processing

## License

ISC

## Support

For issues or questions, please open an issue on the GitHub repository.
