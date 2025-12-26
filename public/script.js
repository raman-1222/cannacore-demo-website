// State management
let selectedImages = [];
let selectedPdf = null;
let selectedLabelsPdf = null;

// Get DOM elements
const imageInput = document.getElementById('imageInput');
const pdfInput = document.getElementById('pdfInput');
const labelsPdfInput = document.getElementById('labelsPdfInput');
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
    if (e.target.files.length > 0) handlePdfFile(e.target.files[0]);
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
    if (files.length > 0) handlePdfFile(files[0]);
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

// HANDLE IMAGES
function handleImageFiles(files) {
    for (const file of files) {
        if (file.type.startsWith('image/')) {
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
function handlePdfFile(file) {
    selectedPdf = file;
    updatePdfPreview();
    updateSubmitButton();
}

function updatePdfPreview() {
    if (!selectedPdf) {
        pdfPreview.innerHTML = "";
        return;
    }

    pdfPreview.innerHTML = `
        <div class="pdf-preview">
            <strong>${selectedPdf.name}</strong>
            <span>${formatFileSize(selectedPdf.size)}</span>
            <button onclick="removePdf(event)">Remove</button>
        </div>`;
}

function removePdf(e) {
    e.preventDefault();
    selectedPdf = null;
    pdfInput.value = "";
    updatePdfPreview();
    updateSubmitButton();
}

// HANDLE LABELS PDF
function handleLabelsPdfFile(file) {
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

function updateSubmitButton() {
    submitBtn.disabled = !(selectedImages.length > 0 || selectedLabelsPdf); // At least one of images or labels PDF required
}

// HANDLE SUBMIT
uploadForm.addEventListener('submit', async e => {
    e.preventDefault();
    resultsSection.innerHTML = "";
    errorSection.innerHTML = "";

    const formData = new FormData();
    selectedImages.forEach(img => formData.append("images", img));
    // PDF is optional - only add if selected
    if (selectedPdf) {
        formData.append("pdf", selectedPdf);
    }
    // Labels PDF is optional - only add if selected
    if (selectedLabelsPdf) {
        formData.append("labelsPdf", selectedLabelsPdf);
    }

    uploadForm.style.display = "none";
    loadingState.style.display = "block";

    try {
        const response = await fetch("/api/check-compliance", {
            method: "POST",
            body: formData
        });
        const json = await response.json();

        console.log('Full API Response:', json);

        // --------- Extract data from API response -----------
        const result = json?.result || {};
        
        console.log('Result object:', result);
        
        const headerOutput = result.output || "";
        const companyName = result.company_name || "";
        const productType = result.product_type || "";
        const date = result.date || "";
        const time = result.time || "";
        const coaData = result.coa?.output || [];
        const labelsData = result.labels?.output || [];

        console.log('Extracted Header Output:', headerOutput);
        console.log('Extracted COA Data:', coaData);
        console.log('Extracted Labels Data:', labelsData);

        // --------- Collect all product names from labels only (deduplicate and remove substrings) -----------
        const productNamesMap = new Map(); // Use Map to deduplicate case-insensitively
        labelsData.forEach(item => {
            if (item && item.product_name && Array.isArray(item.product_name)) {
                item.product_name.forEach(name => {
                    const lowerName = name.toLowerCase();
                    if (!productNamesMap.has(lowerName)) {
                        productNamesMap.set(lowerName, name);
                    }
                });
            }
        });
        
        // Remove product names that are substrings of other product names
        const finalProductNames = Array.from(productNamesMap.values()).filter((name, index, arr) => {
            return !arr.some((otherName, otherIndex) => {
                return index !== otherIndex && otherName.toLowerCase().includes(name.toLowerCase());
            });
        });
        
        const allProductNames = finalProductNames.join(", ") || "";

        // --------- Calculate overall compliance status and count concerns -----------
        let hasNonCompliant = false;
        let hasHumanReview = false;
        let nonCompliantCount = 0;
        let humanReviewCount = 0;
        
        // Check COA data
        coaData.forEach(item => {
            if (item && item.hasOwnProperty('compliant')) {
                if (item.compliant === false) {
                    hasNonCompliant = true;
                    nonCompliantCount++;
                }
            }
        });
        
        // Check Labels data
        labelsData.forEach(item => {
            if (item && item.hasOwnProperty('compliant')) {
                if (item.compliant === false || item.compliant === "false") {
                    hasNonCompliant = true;
                    nonCompliantCount++;
                } else if (item.compliant === "human_review") {
                    hasHumanReview = true;
                    humanReviewCount++;
                }
            }
        });
        
        let overallStatus = "COMPLIANT";
        let totalConcerns = 0;
        if (hasNonCompliant) {
            overallStatus = "NON-COMPLIANT";
            totalConcerns = nonCompliantCount + humanReviewCount;
        } else if (hasHumanReview) {
            overallStatus = "HUMAN REVIEW";
            totalConcerns = humanReviewCount;
        }

        // --------- Display results -----------
        loadingState.style.display = "none";
        resultsSection.style.display = "block";
        resultsSection.innerHTML = ""; // Clear previous results
        
        // Display Header
        displayHeader(companyName, productType, date, time, headerOutput, overallStatus, allProductNames, totalConcerns);
        
        // Display COA Results
        console.log('Calling displayCOA with', coaData.length, 'items');
        displayCOA(coaData);
        
        // Display Labels Results
        console.log('Calling displayLabels with', labelsData.length, 'items');
        displayLabels(labelsData);
    } catch (err) {
        loadingState.style.display = "none";
        uploadForm.style.display = "block";
        showError(err.message);
    }
});

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
    coaData.forEach((item, idx) => {
        console.log('Processing COA item', idx, item);
        // Skip empty objects or objects without required fields
        if (!item || Object.keys(item).length === 0 || (!item.hasOwnProperty('compliant') && !item.hasOwnProperty('reason'))) {
            return;
        }
        validItemCount++;
        
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
        }
        
        card.innerHTML = `
            <p style="color:black;"><strong>Ref:</strong> ${item.ref || "N/A"}</p>
            <p style="color:${statusColor};font-weight:bold;">${complianceStatus}</p>
            <p style="color:black;"><strong>Reason:</strong> ${item.reason || "None provided"}</p>
            <p style="color:black;"><strong>Evidence:</strong> ${item.evidence || "None provided"}</p>
            ${item.suggested_fix ? `<p style="color:black;"><strong>Suggested Fix:</strong> ${item.suggested_fix}</p>` : ""}
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
    labelsData.forEach((item, idx) => {
        console.log('Processing labels item', idx, item);
        // Skip empty objects or objects without required fields
        if (!item || Object.keys(item).length === 0 || (!item.hasOwnProperty('compliant') && !item.hasOwnProperty('reason'))) {
            return;
        }
        validItemCount++;
        
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
        } else if (compliantValue === "human_review") {
            complianceStatus = "⚠ HUMAN REVIEW";
            statusColor = "orange";
        }
        
        card.innerHTML = `
            <p style="color:black;"><strong>Ref:</strong> ${item.ref || "N/A"}</p>
            <p style="color:${statusColor};font-weight:bold;">${complianceStatus}</p>
            <p style="color:black;"><strong>Reason:</strong> ${item.reason || "None provided"}</p>
            <p style="color:black;"><strong>Evidence:</strong> ${item.evidence || "None provided"}</p>
            ${item.suggested_fix ? `<p style="color:black;"><strong>Suggested Fix:</strong> ${item.suggested_fix}</p>` : ""}
        `;
        labelsDiv.appendChild(card);
    });
    
    resultsSection.appendChild(labelsDiv);
    console.log('Labels section appended with', validItemCount, 'valid items');
}

function showError(msg) {
    errorSection.style.display = "block";
    errorSection.innerHTML = `<p>${msg}</p>`;
}