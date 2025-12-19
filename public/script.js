// State management
let selectedImages = [];
let selectedPdf = null;

// Get DOM elements
const imageInput = document.getElementById('imageInput');
const pdfInput = document.getElementById('pdfInput');
const imageUploadArea = document.getElementById('imageUploadArea');
const pdfUploadArea = document.getElementById('pdfUploadArea');
const imagePreview = document.getElementById('imagePreview');
const pdfPreview = document.getElementById('pdfPreview');
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

function formatFileSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i)) + ' ' + sizes[i];
}

function updateSubmitButton() {
    submitBtn.disabled = !(selectedImages.length > 0); // Only images required, PDF is optional
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
        const output = json?.result?.output || {};
        const result = json?.result || {};
        
        console.log('Output object:', output);
        console.log('Result object:', result);
        
        const issues = output.issues || [];
        const coaData = result.coa?.output || [];
        const labelsData = result.labels?.output || [];

        console.log('Extracted Issues:', issues);
        console.log('Extracted COA Data:', coaData);
        console.log('Extracted Labels Data:', labelsData);

        // --------- Display results -----------
        loadingState.style.display = "none";
        resultsSection.style.display = "block";
        resultsSection.innerHTML = ""; // Clear previous results
        
        // Display Issues
        console.log('Calling displayIssues with', issues.length, 'issues');
        displayIssues(issues);
        
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

// DISPLAY ISSUES ON SAME PAGE
function displayIssues(issues) {
    console.log('In displayIssues, issues:', issues);
    const issuesDiv = document.createElement("div");
    issuesDiv.className = "results-category";
    issuesDiv.innerHTML = `<h2>NON-COMPLIANT ITEMS (${issues.length})</h2>`;

    if (!issues || issues.length === 0) {
        issuesDiv.innerHTML += "<p>No non-compliant issues found</p>";
        resultsSection.appendChild(issuesDiv);
        console.log('No issues to display');
        return;
    }

    issues.forEach((issue, idx) => {
        console.log('Processing issue', idx, issue);
        const card = document.createElement("div");
        card.className = "results-card";

        card.innerHTML = `
            <p style="color:red;font-weight:bold;">${issue.issue_identified || issue.reason || "Unspecified issue"}</p>
            <p><strong>Evidence:</strong> ${issue.evidence || "None provided"}</p>
            <p><strong>Suggested Fix:</strong> ${issue.suggested_fix || "None provided"}</p>
        `;
        issuesDiv.appendChild(card);
    });
    
    resultsSection.appendChild(issuesDiv);
    console.log('Issues section appended');
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
        if (!item || Object.keys(item).length === 0) return; // Skip empty objects
        validItemCount++;
        
        const card = document.createElement("div");
        card.className = "results-card";
        
        const compliantStatus = item.compliant ? "✓ COMPLIANT" : "✗ NON-COMPLIANT";
        const statusColor = item.compliant ? "green" : "red";
        
        card.innerHTML = `
            <p style="color:${statusColor};font-weight:bold;">${compliantStatus}</p>
            <p style="color:black;"><strong>Reason:</strong> ${item.reason || "None provided"}</p>
            <p style="color:black;"><strong>Evidence:</strong> ${item.evidence || "None provided"}</p>
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
        if (!item || Object.keys(item).length === 0) return; // Skip empty objects
        validItemCount++;
        
        const card = document.createElement("div");
        card.className = "results-card";
        
        const compliantStatus = item.compliant ? "✓ COMPLIANT" : "✗ NON-COMPLIANT";
        const statusColor = item.compliant ? "green" : "red";
        
        card.innerHTML = `
            <p style="color:${statusColor};font-weight:bold;">${compliantStatus}</p>
            <p style="color:black;"><strong>Reason:</strong> ${item.reason || "None provided"}</p>
            <p style="color:black;"><strong>Evidence:</strong> ${item.evidence || "None provided"}</p>
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