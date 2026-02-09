// State management
let selectedImages = [];
let selectedPdfs = null;
let selectedLabelsPdf = null;
let selectedJurisdictions = [];

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
    submitBtn.disabled = !(selectedImages.length > 0 || selectedLabelsPdf) || selectedJurisdictions.length === 0;
}

// HANDLE SUBMIT
uploadForm.addEventListener('submit', async e => {
    e.preventDefault();
    resultsSection.innerHTML = "";
    errorSection.innerHTML = "";

    const formData = new FormData();
    selectedImages.forEach(img => formData.append("images", img));
    // COA PDF is optional - only add if selected
    if (selectedPdfs) {
        formData.append("pdf", selectedPdfs);
    }
    // Labels PDF is optional - only add if selected
    if (selectedLabelsPdf) {
        formData.append("labelsPdf", selectedLabelsPdf);
    }
    // Add selected jurisdictions
    selectedJurisdictions.forEach(jurisdiction => {
        formData.append("jurisdictions", jurisdiction);
    });

    uploadForm.style.display = "none";
    loadingState.style.display = "block";
    loadingState.innerHTML = '<div class="loading-spinner"></div><p>Submitting compliance check...</p>';

    try {
        const response = await fetch("/api/check-compliance", {
            method: "POST",
            body: formData
        });

        console.log('Response Status:', response.status);
        console.log('Response Headers:', response.headers);
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

        loadingState.innerHTML = `<div class="loading-spinner"></div><p>Checking compliance...<br/>(attempt ${pollCount})</p>`;

        await new Promise(resolve => setTimeout(resolve, pollInterval));

        try {
            const response = await fetch(`/api/results/${requestId}`);
            const resultData = await response.json();

            console.log(`Poll ${pollCount}:`, resultData);

            if (response.ok && resultData.success && resultData.status === 'success') {
                // Results ready! Data is now properly extracted
                console.log('Results received!');
                console.log('Storing result:', resultData.data);
                sessionStorage.setItem("complianceResults", JSON.stringify(resultData.data));
                loadingState.style.display = "none";
                window.location.href = "/results.html";
                return;
            } else if (resultData.status === 'failed' || resultData.error) {
                throw new Error(resultData.error || 'Workflow failed');
            }
            // Still processing, continue polling
            console.log(`Status: ${resultData.status}, continuing...`);
        } catch (err) {
            console.error(`Poll ${pollCount} error:`, err);
            // Don't throw on individual poll errors, keep trying
        }
    }
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
            <p style="color:black;"><strong>${serialNumber}. Ref:</strong> ${getRefWithHyperlink(item.ref)}</p>
            <p style="color:${statusColor};font-weight:bold;">${complianceStatus}</p>
            <p style="color:black;"><strong>Rule Summary:</strong> ${item.rule_summary || "None provided"}</p>
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
            <p style="color:black;"><strong>${serialNumber}. Ref:</strong> ${getRefWithHyperlink(item.ref)}</p>
            <p style="color:${statusColor};font-weight:bold;">${complianceStatus}</p>
            <p style="color:black;"><strong>Rule Summary:</strong> ${item.rule_summary || "None provided"}</p>
            <p style="color:black;"><strong>Evidence:</strong> ${item.evidence || "None provided"}</p>
            ${item.suggested_fix ? `<p style="color:black;"><strong>Suggested Fix:</strong> ${item.suggested_fix}</p>` : ""}
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