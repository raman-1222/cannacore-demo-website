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

// Image upload handling
imageUploadArea.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', (e) => {
    handleImageFiles(e.target.files);
});

// Drag and drop for images
imageUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    imageUploadArea.classList.add('drag-over');
});

imageUploadArea.addEventListener('dragleave', () => {
    imageUploadArea.classList.remove('drag-over');
});

imageUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    imageUploadArea.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    handleImageFiles(files);
});

// PDF upload handling
pdfUploadArea.addEventListener('click', () => pdfInput.click());

pdfInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handlePdfFile(e.target.files[0]);
    }
});

// Drag and drop for PDF
pdfUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    pdfUploadArea.classList.add('drag-over');
});

pdfUploadArea.addEventListener('dragleave', () => {
    pdfUploadArea.classList.remove('drag-over');
});

pdfUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    pdfUploadArea.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf');
    if (files.length > 0) {
        handlePdfFile(files[0]);
    }
});

// Handle image files
function handleImageFiles(files) {
    const fileArray = Array.from(files);
    
    fileArray.forEach(file => {
        if (file.type.startsWith('image/')) {
            selectedImages.push(file);
        }
    });

    updateImagePreview();
    updateSubmitButton();
}

// Update image preview
function updateImagePreview() {
    if (selectedImages.length === 0) {
        imagePreview.innerHTML = '';
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'image-preview-grid';

    selectedImages.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'image-preview-item';

        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.alt = file.name;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-image';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = (e) => {
            e.preventDefault();
            removeImage(index);
        };

        item.appendChild(img);
        item.appendChild(removeBtn);
        grid.appendChild(item);
    });

    imagePreview.innerHTML = '';
    imagePreview.appendChild(grid);
}

// Remove image
function removeImage(index) {
    selectedImages.splice(index, 1);
    updateImagePreview();
    updateSubmitButton();
}

// Handle PDF file
function handlePdfFile(file) {
    if (file.type === 'application/pdf') {
        selectedPdf = file;
        updatePdfPreview();
        updateSubmitButton();
    }
}

// Update PDF preview
function updatePdfPreview() {
    if (!selectedPdf) {
        pdfPreview.innerHTML = '';
        return;
    }

    const preview = document.createElement('div');
    preview.className = 'pdf-preview';

    preview.innerHTML = `
        <div class="pdf-icon">PDF</div>
        <div class="pdf-info">
            <strong>${selectedPdf.name}</strong>
            <span>${formatFileSize(selectedPdf.size)}</span>
        </div>
        <button class="remove-pdf" onclick="removePdf(event)">Remove</button>
    `;

    pdfPreview.innerHTML = '';
    pdfPreview.appendChild(preview);
}

// Remove PDF
function removePdf(e) {
    e.preventDefault();
    selectedPdf = null;
    pdfInput.value = '';
    updatePdfPreview();
    updateSubmitButton();
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Update submit button state
function updateSubmitButton() {
    submitBtn.disabled = !(selectedImages.length > 0 && selectedPdf);
}

// Handle form submission
uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validate
    if (selectedImages.length === 0 || !selectedPdf) {
        showError('Please upload both images and a PDF file.');
        return;
    }

    // Prepare form data
    const formData = new FormData();
    
    selectedImages.forEach(image => {
        formData.append('images', image);
    });
    
    formData.append('pdf', selectedPdf);

    // Show loading state
    uploadForm.style.display = 'none';
    loadingState.style.display = 'block';
    resultsSection.style.display = 'none';
    errorSection.style.display = 'none';

    try {
        const response = await fetch('/api/check-compliance', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to check compliance');
        }

        // Display results
        displayResults(data.result);

    } catch (error) {
        console.error('Error:', error);
        showError(error.message || 'An error occurred while checking compliance. Please try again.');
    } finally {
        loadingState.style.display = 'none';
        uploadForm.style.display = 'block';
    }
});

// Display results
function displayResults(result) {
    console.log('Displaying results:', result);

    const compliantList = document.getElementById('compliantList');
    const nonCompliantList = document.getElementById('nonCompliantList');

    // Clear previous results
    compliantList.innerHTML = '';
    nonCompliantList.innerHTML = '';

    // Handle compliant items
    if (result.compliant_items && result.compliant_items.length > 0) {
        result.compliant_items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'compliant-card';
            card.innerHTML = `<p>${item.summary}</p>`;
            compliantList.appendChild(card);
        });
    } else {
        compliantList.innerHTML = '<p class="empty-state">No compliant items found</p>';
    }

    // Handle non-compliant items
    if (result.non_compliant_items && result.non_compliant_items.length > 0) {
        result.non_compliant_items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'non-compliant-card';
            card.innerHTML = `
                <h4>Issue</h4>
                <p>${item.reason}</p>
                <strong>Evidence:</strong>
                <p>${item.evidence}</p>
                <strong>Suggested Fix:</strong>
                <p>${item.suggested_fix}</p>
            `;
            nonCompliantList.appendChild(card);
        });
    } else {
        nonCompliantList.innerHTML = '<p class="empty-state">No non-compliant items found</p>';
    }

    // Show results section
    resultsSection.style.display = 'block';
    
    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Show error message
function showError(message) {
    errorSection.innerHTML = `
        <h3>Error</h3>
        <p>${message}</p>
    `;
    errorSection.style.display = 'block';
    
    // Scroll to error
    errorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
