// State management
let selectedImages = [];
let selectedPdfs = null;
let selectedLabelsPdf = null;
let selectedJurisdictions = [];

// FILE SIZE VALIDATION CONSTANTS
const MAX_FILE_SIZE = 40 * 1024 * 1024; // 40 MB

// Get DOM elements
const imageInput = document.getElementById('imageInput');
const pdfInput = document.getElementById('pdfInput');
const labelsPdfInput = document.getElementById('labelsPdfInput');
const jurisdictionDropdownBtn = document.getElementById('jurisdictionDropdownBtn');
const jurisdictionDropdownMenu = document.getElementById('jurisdictionDropdownMenu');
const jurisdictionPlaceholder = document.getElementById('jurisdictionPlaceholder');
const jurisdictionCheckboxes = document.querySelectorAll('.jurisdiction-checkbox');
const imageUploadArea = document.getElementById('imageUploadArea');
const pdfUploadArea = document.getElementById('pdfUploadArea');
const labelsPdfUploadArea = document.getElementById('labelsPdfUploadArea');
const imagePreview = document.getElementById('imagePreview');
const pdfPreview = document.getElementById('pdfPreview');
const labelsPdfPreview = document.getElementById('labelsPdfPreview');
const uploadForm = document.getElementById('uploadForm');
const submitBtn = document.getElementById('submitBtn');
const loadingState = document.getElementById('loadingState');
const resultsSection = document.getElementById('resultsSection');
const errorSection = document.getElementById('errorSection');

// IMAGE file input
imageUploadArea.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', (e) => handleImageFiles(e.target.files));

imageUploadArea.addEventListener('dragover', e => {
    e.preventDefault();
    imageUploadArea.classList.add('drag-over');
});

imageUploadArea.addEventListener('dragleave', () => {
    imageUploadArea.classList.remove('drag-over');
});

imageUploadArea.addEventListener('drop', e => {
    e.preventDefault();
    imageUploadArea.classList.remove('drag-over');
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
    handleImageFiles(files);
});

// PDF file input
pdfUploadArea.addEventListener('click', () => pdfInput.click());
pdfInput.addEventListener('change', e => {
    if (e.target.files.length > 0) handlePdfFiles(e.target.files[0]);
});

pdfUploadArea.addEventListener('dragover', e => {
    e.preventDefault();
    pdfUploadArea.classList.add('drag-over');
});

pdfUploadArea.addEventListener('dragleave', () => pdfUploadArea.classList.remove('drag-over'));

pdfUploadArea.addEventListener('drop', e => {
    e.preventDefault();
    pdfUploadArea.classList.remove('drag-over');
    const files = [...e.dataTransfer.files].filter(f => f.type === 'application/pdf');
    if (files.length > 0) handlePdfFiles(files[0]);
});

// LABELS PDF file input
labelsPdfUploadArea.addEventListener('click', () => labelsPdfInput.click());
labelsPdfInput.addEventListener('change', e => {
    if (e.target.files.length > 0) handleLabelsPdfFile(e.target.files[0]);
});

labelsPdfUploadArea.addEventListener('dragover', e => {
    e.preventDefault();
    labelsPdfUploadArea.classList.add('drag-over');
});

labelsPdfUploadArea.addEventListener('dragleave', () => labelsPdfUploadArea.classList.remove('drag-over'));

labelsPdfUploadArea.addEventListener('drop', e => {
    e.preventDefault();
    labelsPdfUploadArea.classList.remove('drag-over');
    const files = [...e.dataTransfer.files].filter(f => f.type === 'application/pdf');
    if (files.length > 0) handleLabelsPdfFile(files[0]);
});

// JURISDICTION SELECTION
jurisdictionDropdownBtn.addEventListener('click', e => {
    e.preventDefault();
    jurisdictionDropdownMenu.style.display = jurisdictionDropdownMenu.style.display === 'none' ? 'block' : 'none';
});

jurisdictionCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', () => {
        selectedJurisdictions = Array.from(jurisdictionCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
        updateJurisdictionDisplay();
        updateSubmitButton();
    });
});

function updateJurisdictionDisplay() {
    if (selectedJurisdictions.length === 0) {
        jurisdictionPlaceholder.textContent = 'Select jurisdictions...';
    } else if (selectedJurisdictions.length === 1) {
        jurisdictionPlaceholder.textContent = selectedJurisdictions[0];
    } else {
        jurisdictionPlaceholder.textContent = `${selectedJurisdictions.length} selected`;
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', e => {
    if (!e.target.closest('.jurisdiction-dropdown-container')) {
        jurisdictionDropdownMenu.style.display = 'none';
    }
});

// HANDLE IMAGES
function handleImageFiles(files) {
    for (const file of files) {
        if (file.type.startsWith('image/')) {
            // Validate file size
            if (!isFileSizeValid(file)) {
                showError(`⚠️ File "${file.name}" is too large! Maximum size is 40 MB. Your file size: ${formatFileSize(file.size)}`);
                return;
            }
            selectedImages.push(file);
        }
    }
    updateImagePreview();
    updateSubmitButton();
}

// IMAGE PREVIEW
function updateImagePreview() {
    if (selectedImages.length === 0) {
        imagePreview.innerHTML = "";
        return;
    }

    const grid = document.createElement("div");
    grid.className = "image-preview-grid";

    selectedImages.forEach((file, index) => {
        const item = document.createElement("div");
        item.className = "image-preview-item";

        const img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        img.alt = file.name;

        const btn = document.createElement("button");
        btn.className = "remove-image";
        btn.textContent = "×";
        btn.onclick = e => {
            e.preventDefault();
            removeImage(index);
        };

        item.appendChild(img);
        item.appendChild(btn);
        grid.appendChild(item);
    });

    imagePreview.innerHTML = "";
    imagePreview.appendChild(grid);
}

function removeImage(index) {
    selectedImages.splice(index, 1);
    updateImagePreview();
    updateSubmitButton();
}

// HANDLE PDF
function handlePdfFiles(file) {
    if (file && file.type === 'application/pdf') {
        // Validate file size
        if (!isFileSizeValid(file)) {
            showError(`⚠️ File "${file.name}" is too large! Maximum size is 40 MB. Your file size: ${formatFileSize(file.size)}`);
            pdfInput.value = "";
            return;
        }
        selectedPdfs = file;
    }
    pdfInput.value = "";
    updatePdfPreview();
    updateSubmitButton();
}

function updatePdfPreview() {
    if (!selectedPdfs) {
        pdfPreview.innerHTML = "";
        return;
    }

    pdfPreview.innerHTML = `
        <div class="pdf-preview">
            <strong>${selectedPdfs.name}</strong>
            <span>${formatFileSize(selectedPdfs.size)}</span>
            <button onclick="removePdf(event)">Remove</button>
        </div>`;
}

function removePdf(e) {
    e.preventDefault();
    selectedPdfs = null;
    pdfInput.value = "";
    updatePdfPreview();
    updateSubmitButton();
}

// HANDLE LABELS PDF
function handleLabelsPdfFile(file) {
    // Validate file size
    if (!isFileSizeValid(file)) {
        showError(`⚠️ File "${file.name}" is too large! Maximum size is 40 MB. Your file size: ${formatFileSize(file.size)}`);
        labelsPdfInput.value = "";
        return;
    }
    selectedLabelsPdf = file;
    updateLabelsPdfPreview();
    updateSubmitButton();
}

function updateLabelsPdfPreview() {
    if (!selectedLabelsPdf) {
        labelsPdfPreview.innerHTML = "";
        return;
    }

    labelsPdfPreview.innerHTML = `
        <div class="pdf-preview">
            <strong>${selectedLabelsPdf.name}</strong>
            <span>${formatFileSize(selectedLabelsPdf.size)}</span>
            <button onclick="removeLabelsPdf(event)">Remove</button>
        </div>`;
}

function removeLabelsPdf(e) {
    e.preventDefault();
    selectedLabelsPdf = null;
    labelsPdfInput.value = "";
    updateLabelsPdfPreview();
    updateSubmitButton();
}

function formatFileSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i)) + ' ' + sizes[i];
}

// FILE SIZE VALIDATION
function isFileSizeValid(file) {
    if (file.size > MAX_FILE_SIZE) {
        console.warn(`File "${file.name}" exceeds maximum size of 40 MB. File size: ${formatFileSize(file.size)}`);
        return false;
    }
    return true;
}

function updateSubmitButton() {
    submitBtn.disabled = !(selectedImages.length > 0 || selectedPdfs || selectedLabelsPdf) || selectedJurisdictions.length === 0;
}

// **CHUNKED FILE UPLOAD UTILITY**
const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks (safe margin for Vercel 6MB limit)

async function uploadFileInChunks(file, fileType) {
    const uploadId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let uploadedBytes = 0;

    console.log(`Starting chunked upload: ${file.name}, ${totalChunks} chunks, ${CHUNK_SIZE / 1024 / 1024}MB per chunk`);

    for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        console.log(`Uploading chunk ${i + 1}/${totalChunks}: ${start} - ${end} bytes`);
        loadingState.innerHTML = `<div class="loading-spinner"></div><p>Uploading ${file.name}...<br/>${formatFileSize(end)} / ${formatFileSize(file.size)}</p>`;

        try {
            const response = await fetch('/api/upload-chunk', {
                method: 'POST',
                headers: {
                    'x-upload-id': uploadId,
                    'x-chunk-index': i,
                    'x-total-chunks': totalChunks,
                    'x-file-name': file.name,
                    'x-file-type': fileType,
                    'Content-Type': 'application/octet-stream'
                },
                body: chunk
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || `Failed to upload chunk ${i + 1}`);
            }

            const result = await response.json();
            uploadedBytes = end;
            console.log(`Chunk ${i + 1}/${totalChunks} uploaded successfully. Progress: ${result.progress}%`);

        } catch (error) {
            console.error(`Error uploading chunk ${i + 1}:`, error);
            // Retry once on failure
            console.log(`Retrying chunk ${i + 1}...`);
            try {
                const retryResponse = await fetch('/api/upload-chunk', {
                    method: 'POST',
                    headers: {
                        'x-upload-id': uploadId,
                        'x-chunk-index': i,
                        'x-total-chunks': totalChunks,
                        'x-file-name': file.name,
                        'x-file-type': fileType,
                        'Content-Type': 'application/octet-stream'
                    },
                    body: chunk
                });

                if (!retryResponse.ok) {
                    throw new Error(`Retry also failed for chunk ${i + 1}`);
                }

                const retryResult = await retryResponse.json();
                console.log(`Chunk ${i + 1} uploaded on retry. Progress: ${retryResult.progress}%`);
            } catch (retryError) {
                console.error(`Chunk ${i + 1} failed even after retry:`, retryError);
                throw retryError;
            }
        }
    }

    // Finalize the upload
    console.log('All chunks uploaded, finalizing...');
    loadingState.innerHTML = `<div class="loading-spinner"></div><p>Finalizing ${file.name}...</p>`;

    let finalizeAttempts = 0;
    const maxFinalizeAttempts = 3;

    while (finalizeAttempts < maxFinalizeAttempts) {
        try {
            finalizeAttempts++;
            const response = await fetch('/api/finalize-chunks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uploadId: uploadId,
                    fileType: fileType
                })
            });

            if (!response.ok) {
                const error = await response.json();
                
                // If some chunks are missing, retry uploading them
                if (error.missingChunks && error.missingChunks.length > 0) {
                    console.log('Retrying missing chunks:', error.missingChunks);
                    
                    for (const chunkIdx of error.missingChunks) {
                        const start = chunkIdx * CHUNK_SIZE;
                        const end = Math.min(start + CHUNK_SIZE, file.size);
                        const chunkData = file.slice(start, end);
                        
                        console.log(`Retrying missing chunk ${chunkIdx}...`);
                        const retryResponse = await fetch('/api/upload-chunk', {
                            method: 'POST',
                            headers: {
                                'x-upload-id': uploadId,
                                'x-chunk-index': chunkIdx,
                                'x-total-chunks': totalChunks,
                                'x-file-name': file.name,
                                'x-file-type': fileType,
                                'Content-Type': 'application/octet-stream'
                            },
                            body: chunkData
                        });
                        
                        if (!retryResponse.ok) {
                            throw new Error(`Failed to retry chunk ${chunkIdx}`);
                        }
                    }
                    
                    // Wait a moment before retrying finalization
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue; // Retry finalization
                }
                
                throw new Error(error.error || 'Failed to finalize upload');
            }

            const result = await response.json();
            console.log(`File finalized and uploaded to: ${result.url}`);
            return result.url;

        } catch (error) {
            console.error(`Finalization attempt ${finalizeAttempts} failed:`, error);
            if (finalizeAttempts < maxFinalizeAttempts) {
                console.log(`Retrying finalization (${finalizeAttempts}/${maxFinalizeAttempts})...`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
            } else {
                throw error;
            }
        }
    }

}

// HANDLE SUBMIT
uploadForm.addEventListener('submit', async e => {
    e.preventDefault();
    resultsSection.innerHTML = "";
    errorSection.innerHTML = "";

    uploadForm.style.display = "none";
    loadingState.style.display = "block";
    loadingState.innerHTML = '<div class="loading-spinner"></div><p>Preparing files...</p>';

    try {
        // Validate that at least one file is selected
        if (selectedImages.length === 0 && !selectedPdfs && !selectedLabelsPdf) {
            throw new Error('Please upload at least one file (image or PDF)');
        }

        const imageUrls = [];
        const coaUrls = [];

        // Upload all images via chunking (ensures compatibility)
        if (selectedImages.length > 0) {
            console.log(`Uploading ${selectedImages.length} image(s)...`);
            for (let idx = 0; idx < selectedImages.length; idx++) {
                const img = selectedImages[idx];
                console.log(`Uploading image ${idx + 1}/${selectedImages.length}: ${img.name}`);
                loadingState.innerHTML = `<div class="loading-spinner"></div><p>Uploading image ${idx + 1}/${selectedImages.length}...<br/>${img.name}</p>`;
                
                try {
                    const url = await uploadFileInChunks(img, 'images');
                    imageUrls.push(url);
                    console.log(`Image ${idx + 1} uploaded successfully: ${url}`);
                } catch (imgError) {
                    console.error(`Failed to upload image ${idx + 1}:`, imgError);
                    throw imgError;
                }
            }
        }

        // Upload COA PDF via chunking
        if (selectedPdfs) {
            console.log(`Uploading COA PDF: ${selectedPdfs.name}`);
            loadingState.innerHTML = `<div class="loading-spinner"></div><p>Uploading COA PDF...<br/>${selectedPdfs.name}</p>`;
            try {
                const url = await uploadFileInChunks(selectedPdfs, 'pdfs');
                coaUrls.push(url);
                console.log(`COA PDF uploaded successfully: ${url}`);
            } catch (pdfError) {
                console.error('Failed to upload COA PDF:', pdfError);
                throw pdfError;
            }
        }

        // Upload Labels PDF via chunking
        if (selectedLabelsPdf) {
            console.log(`Uploading Labels PDF: ${selectedLabelsPdf.name}`);
            loadingState.innerHTML = `<div class="loading-spinner"></div><p>Uploading Labels PDF...<br/>${selectedLabelsPdf.name}</p>`;
            try {
                const url = await uploadFileInChunks(selectedLabelsPdf, 'labels-pdfs');
                imageUrls.push(url);
                console.log(`Labels PDF uploaded successfully: ${url}`);
            } catch (labelError) {
                console.error('Failed to upload Labels PDF:', labelError);
                throw labelError;
            }
        }

        console.log(`All files uploaded. Images: ${imageUrls.length}, COA PDFs: ${coaUrls.length}`);

        loadingState.innerHTML = '<div class="loading-spinner"></div><p>Submitting compliance check...</p>';

        // Send URLs to backend via JSON
        const response = await fetch("/api/check-compliance-urls", {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageurl: imageUrls,
                coaurl: coaUrls.length > 0 ? coaUrls : ["https://cdn.shopify.com/s/files/1/0665/8188/9159/files/Blueberry_-_Mega_Smasher_s.pdf?v=1764824884"],
                jurisdictions: selectedJurisdictions,
                date: new Date().toLocaleDateString(),
                time: new Date().toLocaleTimeString(),
                company_name: 'N/A',
                product_type: 'N/A'
            })
        });

        console.log('Response Status:', response.status);
        console.log('Response OK:', response.ok);

        if (!response.ok) {
            let errorData;
            try {
                const text = await response.text();
                errorData = JSON.parse(text);
            } catch (e) {
                errorData = { error: `Server error: ${response.status} ${response.statusText}` };
            }
            console.error('Error response:', errorData);
            throw new Error(errorData.error || `Server error: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        console.log('API Response:', json);

        // Check if we got a requestId (async response)
        if (json.requestId && json.status === 'pending') {
            console.log('Got requestId, starting polling:', json.requestId);
            // Show checking compliance spinner immediately
            loadingState.innerHTML = '<div class="loading-spinner"></div><p>Checking compliance...</p>';
            await pollForResults(json.requestId);
        } else {
            // Synchronous response with results
            const result = json?.result || json;
            sessionStorage.setItem("complianceResults", JSON.stringify(result));
            window.location.href = "/results.html";
        }
    } catch (err) {
        loadingState.style.display = "none";
        uploadForm.style.display = "block";
        showError(err.message);
    }
});

// Function to poll for results
async function pollForResults(requestId) {
    let pollCount = 0;
    const pollInterval = 1 * 60 * 1000; // 1 minute = 60,000ms

    while (true) {
        pollCount++;

        loadingState.innerHTML = `<div class="loading-spinner"></div><p>Checking compliance...</p>`;

        await new Promise(resolve => setTimeout(resolve, pollInterval));

        try {
            const response = await fetch(`/api/results/${requestId}`);
            const resultData = await response.json();

            console.log(`Poll ${pollCount}:`, resultData);

            if (response.ok && resultData.success && resultData.status === 'success') {
                // Results ready! Extract the actual result object with compliance_check
                console.log('Results received!');
                const actualResult = resultData.data.output?.result || resultData.data;
                console.log('Storing result:', actualResult);
                sessionStorage.setItem("complianceResults", JSON.stringify(actualResult));
                loadingState.style.display = "none";
                window.location.href = "/results.html";
                return;
            } else if (resultData.status === 'failed') {
                // Workflow failed - display error to user
                const errorMessage = resultData.error || 'Compliance check failed. Please try again.';
                console.error(`Workflow failed: ${errorMessage}`);
                loadingState.style.display = "none";
                showError(`❌ ${errorMessage}`);
                throw new Error(errorMessage);
            } else if (resultData.error) {
                // Other error occurred
                console.error(`Error received: ${resultData.error}`);
                loadingState.style.display = "none";
                showError(`❌ ${resultData.error}`);
                throw new Error(resultData.error);
            }
            // Still processing, continue polling
            console.log(`Status: ${resultData.status}, continuing...`);
        } catch (err) {
            console.error(`Poll ${pollCount} error:`, err);
            // Don't throw on individual poll errors, keep trying
        }
    }
}

// UTILITY: Escape HTML entities to prevent tag interpretation
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text || '').replace(/[&<>"']/g, m => map[m]);
}

// DISPLAY HEADER
function displayHeader(companyName, productType, date, time, output, overallStatus, allProductNames, totalConcerns) {
    console.log('In displayHeader');
    const headerDiv = document.createElement("div");
    headerDiv.className = "results-category header-section";
    headerDiv.style.borderBottom = "1px solid #ddd";
    headerDiv.style.paddingBottom = "30px";
    headerDiv.style.marginBottom = "40px";
    
    const productDisplay = productType ? `${productType}` : "";
    
    // Determine status color
    let statusColor = "green";
    let statusDisplay = overallStatus;
    if (overallStatus === "NON-COMPLIANT") {
        statusColor = "red";
        statusDisplay = `${overallStatus} (${totalConcerns} concern${totalConcerns !== 1 ? 's' : ''})`;
    } else if (overallStatus === "HUMAN REVIEW") {
        statusColor = "orange";
        statusDisplay = `${overallStatus} (${totalConcerns} concern${totalConcerns !== 1 ? 's' : ''})`;
    }
    
    const dateTimeDisplay = date && time ? `${date} ${time}` : date || time || "N/A";
    
    headerDiv.innerHTML = `
        <h1 style="text-align: center; font-size: 1.8rem; margin-bottom: 30px; font-weight: bold;">Label & Packaging Review</h1>
        <div style="text-align: left;">
            <p style="font-size: 0.95rem; margin-bottom: 10px;"><strong>Jurisdiction:</strong> Florida</p>
            <p style="font-size: 0.95rem; margin-bottom: 10px;"><strong>Company Name:</strong> ${companyName || "N/A"}</p>
            <p style="font-size: 0.95rem; margin-bottom: 10px;"><strong>Product Type:</strong> ${productDisplay || "N/A"}</p>
            ${allProductNames ? `<p style="font-size: 0.95rem; margin-bottom: 10px;"><strong>Product Name:</strong> ${allProductNames}</p>` : ""}
            <p style="font-size: 0.95rem; margin-bottom: 10px;"><strong>Date & Time:</strong> ${dateTimeDisplay}</p>
            <p style="font-size: 0.95rem; margin-bottom: 20px;"><strong>Compliance Status:</strong> <span style="color: ${statusColor}; font-weight: bold;">${statusDisplay}</span></p>
            <p style="font-size: 0.95rem; line-height: 1.6; color: #555;">${output || ""}</p>
        </div>
    `;
    
    resultsSection.appendChild(headerDiv);
    console.log('Header section appended');
}

// DISPLAY COA RESULTS
function displayCOA(coaData) {
    console.log('In displayCOA, coaData:', coaData);
    const coaDiv = document.createElement("div");
    coaDiv.className = "results-category";
    coaDiv.innerHTML = `<h2>CERTIFICATE OF ANALYSIS (COA) COMPLIANCE</h2>`;

    if (!coaData || coaData.length === 0) {
        coaDiv.innerHTML += "<p>No COA data available</p>";
        resultsSection.appendChild(coaDiv);
        console.log('No COA data to display');
        return;
    }

    let validItemCount = 0;
    let serialNumber = 0;
    coaData.forEach((item, idx) => {
        console.log('Processing COA item', idx, item);
        // Skip empty objects or objects without required fields
        if (!item || Object.keys(item).length === 0 || (!item.hasOwnProperty('compliant') && !item.hasOwnProperty('reason'))) {
            return;
        }
        validItemCount++;
        serialNumber++;
        
        const card = document.createElement("div");
        card.className = "results-card";
        
        // Determine compliance status
        let complianceStatus = "Unknown";
        let statusColor = "gray";
        
        if (item.compliant === true) {
            complianceStatus = "✓ COMPLIANT";
            statusColor = "green";
        } else if (item.compliant === false) {
            complianceStatus = "✗ NON-COMPLIANT";
            statusColor = "red";
        } else if (item.compliant === "human review" || item.compliant === "human_review") {
            complianceStatus = "⚠ HUMAN REVIEW";
            statusColor = "orange";
        }
        
        card.innerHTML = `
            <p style="color:black; width: 100%; margin: 0 0 12px 0; padding: 0; box-sizing: border-box; word-wrap: break-word; overflow-wrap: break-word;"><strong>${serialNumber}. Ref:</strong> ${getRefWithHyperlink(item.ref)}</p>
            <p style="color:${statusColor};font-weight:bold; width: 100%; margin: 0 0 12px 0; padding: 0; box-sizing: border-box; word-wrap: break-word; overflow-wrap: break-word;">${complianceStatus}</p>
            <p style="color:black; width: 100%; margin: 0 0 12px 0; padding: 0; box-sizing: border-box; word-wrap: break-word; overflow-wrap: break-word;"><strong>Rule Summary:</strong> ${escapeHtml(item.rule_summary || "None provided")}</p>
            <p style="color:black; width: 100%; margin: 0 0 12px 0; padding: 0; box-sizing: border-box; word-wrap: break-word; overflow-wrap: break-word;"><strong>Evidence:</strong> ${escapeHtml(item.evidence || "None provided")}</p>
            ${item.suggested_fix ? `<p style="color:black; width: 100%; margin: 0 0 12px 0; padding: 0; box-sizing: border-box; word-wrap: break-word; overflow-wrap: break-word;"><strong>Suggested Fix:</strong> ${escapeHtml(item.suggested_fix)}</p>` : ""}
        `;
        coaDiv.appendChild(card);
    });
    
    resultsSection.appendChild(coaDiv);
    console.log('COA section appended with', validItemCount, 'valid items');
}

// DISPLAY LABELS RESULTS
function displayLabels(labelsData) {
    console.log('In displayLabels, labelsData:', labelsData);
    const labelsDiv = document.createElement("div");
    labelsDiv.className = "results-category";
    labelsDiv.innerHTML = `<h2>PACKAGING & LABELS COMPLIANCE</h2>`;

    if (!labelsData || labelsData.length === 0) {
        labelsDiv.innerHTML += "<p>No labels data available</p>";
        resultsSection.appendChild(labelsDiv);
        console.log('No labels data to display');
        return;
    }

    let validItemCount = 0;
    let serialNumber = 0;
    labelsData.forEach((item, idx) => {
        console.log('Processing labels item', idx, item);
        // Skip empty objects or objects without required fields
        if (!item || Object.keys(item).length === 0 || (!item.hasOwnProperty('compliant') && !item.hasOwnProperty('reason'))) {
            return;
        }
        validItemCount++;
        serialNumber++;
        
        const card = document.createElement("div");
        card.className = "results-card";
        
        // Determine compliance status - handle both boolean and string values
        let complianceStatus = "Unknown";
        let statusColor = "gray";
        
        const compliantValue = item.compliant;
        if (compliantValue === true || compliantValue === "true") {
            complianceStatus = "✓ COMPLIANT";
            statusColor = "green";
        } else if (compliantValue === false || compliantValue === "false") {
            complianceStatus = "✗ NON-COMPLIANT";
            statusColor = "red";
        } else if (compliantValue === "human_review" || compliantValue === "human review") {
            complianceStatus = "⚠ HUMAN REVIEW";
            statusColor = "orange";
        }
        
        card.innerHTML = `
            <p style="color:black; width: 100%; margin: 0 0 12px 0; padding: 0; box-sizing: border-box; word-wrap: break-word; overflow-wrap: break-word;"><strong>${serialNumber}. Ref:</strong> ${getRefWithHyperlink(item.ref)}</p>
            <p style="color:${statusColor};font-weight:bold; width: 100%; margin: 0 0 12px 0; padding: 0; box-sizing: border-box; word-wrap: break-word; overflow-wrap: break-word;">${complianceStatus}</p>
            <p style="color:black; width: 100%; margin: 0 0 12px 0; padding: 0; box-sizing: border-box; word-wrap: break-word; overflow-wrap: break-word;"><strong>Rule Summary:</strong> ${escapeHtml(item.rule_summary || "None provided")}</p>
            <p style="color:black; width: 100%; margin: 0 0 12px 0; padding: 0; box-sizing: border-box; word-wrap: break-word; overflow-wrap: break-word;"><strong>Evidence:</strong> ${escapeHtml(item.evidence || "None provided")}</p>
            ${item.suggested_fix ? `<p style="color:black; width: 100%; margin: 0 0 12px 0; padding: 0; box-sizing: border-box; word-wrap: break-word; overflow-wrap: break-word;"><strong>Suggested Fix:</strong> ${escapeHtml(item.suggested_fix)}</p>` : ""}
        `;
        labelsDiv.appendChild(card);
    });
    
    resultsSection.appendChild(labelsDiv);
    console.log('Labels section appended with', validItemCount, 'valid items');
}

function getRefWithHyperlink(ref) {
    if (!ref || ref === "N/A") {
        return "N/A";
    }
    
    let url = null;
    if (ref.includes("581.217")) {
        url = "https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0500-0599/0581/Sections/0581.217.html";
    } else if (ref.includes("5K-4.034")) {
        url = "https://www.law.cornell.edu/regulations/florida/Fla-Admin-Code-Ann-R-5K-4-034";
    } else if (ref.includes("101.2")) {
        url = "https://www.ecfr.gov/current/title-21/part-101/section-101.2#p-101.2(c)(1)(ii)(B)(3)(iii)";
    } else if (ref.includes("101.5")) {
        url = "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.5";
    } else if (ref.includes("101.9")) {
        url = "https://www.ecfr.gov/current/title-21/part-101#p-101.9(j)(15)(iii)";
    }
    
    if (url) {
        return `<a href="${url}" target="_blank" style="color: #007bff; text-decoration: underline;">${ref}</a>`;
    }
    
    return ref;
}

function showError(msg) {
    errorSection.style.display = "block";
    errorSection.innerHTML = `<p>${msg}</p>`;
}