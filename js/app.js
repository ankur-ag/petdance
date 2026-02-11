// App functionality for video creation workflow
// Handles upload, style selection, generation, and results

let uploadedImage = null;
let uploadedFile = null; // Keep File for API upload
let selectedStyle = null;
let currentJobId = null;
let jobUnsubscribe = null;

// Initialize app on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeUpload();
});

// Initialize upload functionality
function initializeUpload() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const uploadPlaceholder = document.getElementById('upload-placeholder');
    
    if (!uploadArea || !fileInput || !uploadPlaceholder) return;
    
    // Click to upload
    uploadArea.addEventListener('click', (e) => {
        if (e.target.closest('.btn-remove')) return;
        fileInput.click();
    });
    
    // File input change
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleFileUpload(file);
        }
    });
    
    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadPlaceholder.classList.add('drag-over');
    });
    
    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadPlaceholder.classList.remove('drag-over');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadPlaceholder.classList.remove('drag-over');
        
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            handleFileUpload(file);
        } else {
            alert('Please upload an image file (JPG, PNG, WEBP)');
        }
    });
}

// Handle file upload
function handleFileUpload(file) {
    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('Please upload an image file');
        return;
    }
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
    }
    
    uploadedFile = file;
    
    // Read and display image
    const reader = new FileReader();
    reader.onload = (e) => {
        uploadedImage = e.target.result;
        displayPreview(uploadedImage);
        enableNextButton();
    };
    reader.readAsDataURL(file);
}

// Display image preview
function displayPreview(imageSrc) {
    const uploadPlaceholder = document.getElementById('upload-placeholder');
    const uploadPreview = document.getElementById('upload-preview');
    const previewImage = document.getElementById('preview-image');
    
    if (uploadPlaceholder && uploadPreview && previewImage) {
        uploadPlaceholder.style.display = 'none';
        previewImage.src = imageSrc;
        uploadPreview.style.display = 'block';
    }
}

// Remove uploaded image
function removeImage() {
    uploadedImage = null;
    uploadedFile = null;
    
    const uploadPlaceholder = document.getElementById('upload-placeholder');
    const uploadPreview = document.getElementById('upload-preview');
    const fileInput = document.getElementById('file-input');
    
    if (uploadPlaceholder && uploadPreview) {
        uploadPlaceholder.style.display = 'flex';
        uploadPreview.style.display = 'none';
    }
    
    if (fileInput) {
        fileInput.value = '';
    }
    
    disableNextButton();
}

// Enable next button
function enableNextButton() {
    const nextBtn = document.getElementById('next-btn');
    if (nextBtn) {
        nextBtn.disabled = false;
    }
}

// Disable next button
function disableNextButton() {
    const nextBtn = document.getElementById('next-btn');
    if (nextBtn) {
        nextBtn.disabled = true;
    }
}

// Go to style selection
function goToStyleSelection() {
    const uploadSection = document.getElementById('upload-section');
    const styleSection = document.getElementById('style-section');
    
    if (uploadSection && styleSection) {
        uploadSection.style.display = 'none';
        styleSection.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Go back to upload
function goBackToUpload() {
    const uploadSection = document.getElementById('upload-section');
    const styleSection = document.getElementById('style-section');
    
    if (uploadSection && styleSection) {
        styleSection.style.display = 'none';
        uploadSection.style.display = 'block';
        
        // Reset style selection
        selectedStyle = null;
        document.querySelectorAll('.style-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn) {
            generateBtn.disabled = true;
        }
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Select dance style
function selectStyle(style) {
    selectedStyle = style;
    
    // Update UI
    document.querySelectorAll('.style-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    event.currentTarget.classList.add('selected');
    
    // Enable generate button
    const generateBtn = document.getElementById('generate-btn');
    if (generateBtn) {
        generateBtn.disabled = false;
    }
}

// Generate video - calls real API
async function generateVideo() {
    if (!uploadedImage || !uploadedFile || !selectedStyle) {
        alert('Please upload an image and select a style');
        return;
    }

    if (!window.PetDanceAPI) {
        alert('API not loaded. Check Firebase configuration.');
        return;
    }

    const progressSection = document.getElementById('progress-section');
    const styleSection = document.getElementById('style-section');

    if (styleSection) styleSection.style.display = 'none';
    if (progressSection) {
        progressSection.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    updateProgress(10, 'Creating job...');

    try {
        const { jobId, uploadPath } = await PetDanceAPI.createJob(selectedStyle);
        currentJobId = jobId;

        updateProgress(30, 'Uploading image...');

        let fileToUpload = uploadedFile;
        if (!uploadedFile.type.match(/jpeg|jpg/)) {
            fileToUpload = await convertToJpeg(uploadedFile);
        }

        await PetDanceAPI.uploadToStorage(uploadPath, fileToUpload);

        updateProgress(40, 'Getting image URL...');
        const imageUrl = await PetDanceAPI.getDownloadUrlFromPath(uploadPath);

        updateProgress(50, 'Starting AI processing...');
        await PetDanceAPI.startJob(jobId, imageUrl);

        updateProgress(60, 'AI is creating your dancing pet...');

        // Subscribe to real-time updates
        if (window.firebaseDb) {
            jobUnsubscribe = PetDanceAPI.subscribeToJob(jobId, (job) => {
                handleJobUpdate(job);
            });
        } else {
            pollJobStatus(jobId);
        }
    } catch (err) {
        console.error('Generate error:', err);
        showError(err.message);
    }
}

async function convertToJpeg(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
                resolve(new File([blob], 'original.jpg', { type: 'image/jpeg' }));
            }, 'image/jpeg', 0.9);
        };
        img.onerror = () => reject(new Error('Failed to convert image'));
        img.src = URL.createObjectURL(file);
    });
}

async function handleJobUpdate(job) {
    const status = job.status;
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const progressPercentage = document.getElementById('progress-percentage');

    if (status === 'processing') {
        if (progressFill) progressFill.style.width = '75%';
        if (progressPercentage) progressPercentage.textContent = '75';
        if (progressText) progressText.textContent = 'AI is generating your video...';
    } else if (status === 'completed') {
        if (jobUnsubscribe) jobUnsubscribe();
        jobUnsubscribe = null;
        let downloadUrl = null;
        try {
            if (job.outputVideoPath) {
                downloadUrl = await PetDanceAPI.getVideoUrlFromPath(job.outputVideoPath);
            } else {
                downloadUrl = await PetDanceAPI.getDownloadUrl(job.id);
            }
        } catch (e) {
            console.error('Get download URL failed:', e);
        }
        showResult(downloadUrl);
    } else if (status === 'failed') {
        if (jobUnsubscribe) jobUnsubscribe();
        jobUnsubscribe = null;
        showError(job.errorMessage || 'Generation failed');
    }
}

async function pollJobStatus(jobId) {
    const maxAttempts = 120;
    let attempts = 0;

    const poll = async () => {
        if (attempts++ > maxAttempts) {
            showError('Generation timed out. Please try again.');
            return;
        }

        try {
            const data = await PetDanceAPI.getJobStatus(jobId);
            const progress = 60 + Math.min(attempts * 2, 35);
            updateProgress(progress, 'AI is creating your dancing pet...');

            if (data.status === 'completed') {
                let url = data.downloadUrl;
                if (!url && data.outputVideoPath) {
                    try {
                        url = await PetDanceAPI.getVideoUrlFromPath(data.outputVideoPath);
                    } catch (e) {
                        console.error('Get video URL failed:', e);
                    }
                }
                showResult(url);
            } else if (data.status === 'failed') {
                showError(data.errorMessage || 'Generation failed');
            } else {
                setTimeout(poll, 3000);
            }
        } catch (err) {
            showError(err.message);
        }
    };

    poll();
}

function updateProgress(percent, text) {
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const progressPercentage = document.getElementById('progress-percentage');
    if (progressFill) progressFill.style.width = `${percent}%`;
    if (progressPercentage) progressPercentage.textContent = Math.round(percent);
    if (progressText) progressText.textContent = text;
}

function showError(message) {
    if (jobUnsubscribe) jobUnsubscribe();
    jobUnsubscribe = null;

    const progressSection = document.getElementById('progress-section');
    const styleSection = document.getElementById('style-section');

    if (progressSection) progressSection.style.display = 'none';
    if (styleSection) styleSection.style.display = 'block';

    alert(message || 'Something went wrong. Please try again.');
}

// Show result
async function showResult(downloadUrl) {
    const progressSection = document.getElementById('progress-section');
    const resultSection = document.getElementById('result-section');
    const videoPlaceholder = document.querySelector('.result-section .video-placeholder');
    const resultVideo = document.querySelector('.result-video');

    if (progressSection) progressSection.style.display = 'none';
    if (resultSection) resultSection.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (downloadUrl) {
        try {
            if (!downloadUrl.startsWith('http') && currentJobId && window.PetDanceAPI) {
                downloadUrl = await PetDanceAPI.getDownloadUrl(currentJobId);
            }
            if (downloadUrl && videoPlaceholder && resultVideo) {
                videoPlaceholder.style.display = 'none';
                const videoEl = document.createElement('video');
                videoEl.src = downloadUrl;
                videoEl.controls = true;
                videoEl.autoplay = true;
                videoEl.loop = true;
                videoEl.muted = true;
                videoEl.style.width = '100%';
                videoEl.style.borderRadius = 'var(--radius-xl)';
                resultVideo.appendChild(videoEl);
                window.currentResultVideoUrl = downloadUrl;
            }
        } catch (err) {
            console.error('Failed to load video:', err);
        }
    }
}

// Download video
function downloadVideo() {
    const url = window.currentResultVideoUrl;
    if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'petdance-video.mp4';
        a.target = '_blank';
        a.click();
    } else {
        alert('No video available to download');
    }
}

// Share video (mock)
function shareVideo() {
    // Check if Web Share API is available (especially useful for mobile)
    if (navigator.share) {
        navigator.share({
            title: 'Check out my dancing pet!',
            text: 'I made my pet dance with AI on PetDance! 🐾',
            url: window.location.href
        }).catch((error) => {
            // User cancelled share or error occurred
            console.log('Share cancelled:', error);
        });
    } else {
        // Fallback for desktop
        alert('Share this video:\n\n📱 Copy link to share\n📤 Download and share manually\n\n(Native sharing would be available on mobile devices)');
    }
}

// Create another video
function createAnother() {
    if (jobUnsubscribe) jobUnsubscribe();
    jobUnsubscribe = null;
    currentJobId = null;
    window.currentResultVideoUrl = null;

    const resultVideo = document.querySelector('.result-video');
    if (resultVideo) {
        const video = resultVideo.querySelector('video');
        if (video) video.remove();
        const placeholder = resultVideo.querySelector('.video-placeholder');
        if (placeholder) placeholder.style.display = 'flex';
    }

    uploadedImage = null;
    uploadedFile = null;
    selectedStyle = null;
    
    removeImage();
    
    const resultSection = document.getElementById('result-section');
    const uploadSection = document.getElementById('upload-section');
    
    if (resultSection) {
        resultSection.style.display = 'none';
    }
    
    if (uploadSection) {
        uploadSection.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    // Reset progress
    const progressFill = document.getElementById('progress-fill');
    const progressPercentage = document.getElementById('progress-percentage');
    const progressText = document.getElementById('progress-text');
    
    if (progressFill) progressFill.style.width = '0%';
    if (progressPercentage) progressPercentage.textContent = '0%';
    if (progressText) progressText.textContent = 'Analyzing your pet photo...';
}
