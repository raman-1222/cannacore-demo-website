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
    submitBtn.disabled = !(selectedImages.length > 0 && selectedPdf);
}

// HANDLE SUBMIT
uploadForm.addEventListener('submit', async e => {
    e.preventDefault();
    resultsSection.innerHTML = "";
    errorSection.innerHTML = "";
    resultsSection.style.display = "none";
    errorSection.style.display = "none";

    const formData = new FormData();
    selectedImages.forEach(img => formData.append("images", img));
    formData.append("pdf", selectedPdf);

    uploadForm.style.display = "none";
    loadingState.style.display = "block";

    try {
        const response = await fetch("/api/check-compliance", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        console.log("Full API Response:", json);

        // Correct path for Lamatic.ai GraphQL response
        const issues = json?.data?.executeWorkflow?.result?.output?.issues || [];

        loadingState.style.display = "none";

        if (issues.length === 0) {
            resultsSection.style.display = "block";
            resultsSection.innerHTML = `
                <h2>COMPLIANCE CHECK COMPLETE</h2>
                <p style="color: green; font-weight: bold; font-size: 1.5em; text-align: center; margin-top: 2rem;">
                    ✅ No non-compliant issues found!
                </p>
                <p style="text-align: center; margin-top: 1rem;">
                    Your product images and COA appear to be fully compliant.
                </p>`;
        } else {
            displayIssues(issues);
        }

    } catch (err) {
        console.error("Error:", err);
        loadingState.style.display = "none";
        uploadForm.style.display = "block";
        showError("Failed to analyze compliance: " + (err.message || "Unknown error"));
    }
});

// DISPLAY ISSUES ON SAME PAGE
function displayIssues(issues) {
    resultsSection.style.display = "block";
    resultsSection.innerHTML = `<h2>NON-COMPLIANT ITEMS (${issues.length})</h2>`;

    issues.forEach(issue => {
        const card = document.createElement("div");
        card.className = "results-card";

        card.innerHTML = `
            <p style="color:red; font-weight:bold; font-size:1.1em; margin-bottom:0.8rem;">
                ${issue.issue_identified}
            </p>
            <p><strong>Evidence:</strong> ${issue.evidence || "None provided"}</p>
            <p><strong>Suggested Fix:</strong> ${issue.suggested_fix || "None provided"}</p>
        `;
        resultsSection.appendChild(card);
    });
}

function showError(msg) {
    errorSection.style.display = "block";
    errorSection.innerHTML = `<p style="color: red; font-weight: bold;">Error: ${msg}</p>`;
}