this.isLiveDetectionRunning = false;
this.liveDetectionInterval = null;
// Particle Animation Background
class ParticleBackground {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.particleCount = 50;
        this.init();
    }

    init() {
        // Set canvas to full window size
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Create particles
        this.createParticles();

        // Start animation loop
        this.animate();
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    createParticles() {
        this.particles = [];
        for (let i = 0; i < this.particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                radius: Math.random() * 3 + 1,
                speed: Math.random() * 1 + 0.2,
                directionX: Math.random() * 2 - 1,
                directionY: Math.random() * 2 - 1,
                opacity: Math.random() * 0.5 + 0.1
            });
        }
    }

    drawParticles() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            
            // Draw particle
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
            this.ctx.fill();
            
            // Update position
            p.x += p.directionX * p.speed;
            p.y += p.directionY * p.speed;
            
            // Bounce off edges
            if (p.x < 0 || p.x > this.canvas.width) p.directionX *= -1;
            if (p.y < 0 || p.y > this.canvas.height) p.directionY *= -1;
            
            // Draw connections
            for (let j = i + 1; j < this.particles.length; j++) {
                const p2 = this.particles[j];
                const distance = Math.sqrt(
                    Math.pow(p.x - p2.x, 2) + 
                    Math.pow(p.y - p2.y, 2)
                );
                
                if (distance < 150) {
                    this.ctx.beginPath();
                    this.ctx.strokeStyle = `rgba(255, 255, 255, ${0.2 * (1 - distance/150)})`;
                    this.ctx.lineWidth = 0.5;
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.stroke();
                }
            }
        }
    }

    animate() {
        this.drawParticles();
        requestAnimationFrame(() => this.animate());
    }
}

/* ==============================================
        Object Detection Handler
================================================== */
class VisionAIDetector {
    constructor() {
        // DOM Elements
        this.modelSelect = document.getElementById('modelSelect');
        this.thresholdRange = document.getElementById('thresholdRange');
        this.thresholdValue = document.getElementById('thresholdValue');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.imageUpload = document.getElementById('imageUpload');
        this.liveCaptureBtn = document.getElementById('liveCaptureBtn');
        this.screenshotBtn = document.getElementById('screenshotBtn');
        this.liveVideo = document.getElementById('liveVideo');
        this.detectedCanvas = document.getElementById('detectedCanvas');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.modelLabel = document.getElementById('modelLabel');
        this.objectList = document.getElementById('objectList');
        this.objectCounter = document.querySelector('.object-counter');
        this.totalObjects = document.getElementById('totalObjects');
        this.totalCategories = document.getElementById('totalCategories');
        this.avgConfidence = document.getElementById('avgConfidence');
        this.objectTypeChart = document.getElementById('objectTypeChart');
        this.generateAudioBtn = document.getElementById('generateAudioBtn');
        this.voiceTypeSelect = document.getElementById('voiceTypeSelect');
        this.speechRateSelect = document.getElementById('speechRateSelect');
        this.availableVoices = null;
    this.pendingAudioDescription = null;
        // Tab panel elements
        this.objectsTab = document.querySelector('[data-tab="objects"]');
        this.statsTab = document.querySelector('[data-tab="stats"]');
        this.audioTab = document.querySelector('[data-tab="audio"]');
        this.objectsTabPane = document.getElementById('objectsTab');
        this.statsTabPane = document.getElementById('statsTab');
        this.audioTabPane = document.getElementById('audioTab');
        
        // Canvas context
        this.ctx = this.detectedCanvas.getContext('2d');
        
        // State variables
        this.stream = null;
        this.chart = null;
        this.detectionResults = null;
        this.currentImageDataUrl = null; // Store the current image for reprocessing
        this.processingLock = false; // Lock to prevent multiple simultaneous processings
        
        // Backend URL - change this to match your production setup
        this.apiUrl = 'http://localhost:5000';
        
        // Initialize
        this.init();
    }
    
    init() {
        // Set initial values
        this.modelLabel.textContent = this.modelSelect.value.split('.')[0];
        
        // Event listeners for image input
        this.uploadBtn.addEventListener('click', () => this.imageUpload.click());
        this.imageUpload.addEventListener('change', (e) => this.handleImageUpload(e));
        this.liveCaptureBtn.addEventListener('click', () => this.toggleLiveCapture());
        this.screenshotBtn.addEventListener('click', () => this.captureScreenshot());
        
        // Event listeners for settings changes with real-time processing
        this.modelSelect.addEventListener('change', () => {
            this.modelLabel.textContent = this.modelSelect.value.split('.')[0];
            this.reprocessCurrentImage();
        });
        
        this.thresholdRange.addEventListener('input', () => {
            this.thresholdValue.textContent = `${this.thresholdRange.value}%`;
            // Debounce threshold changes to prevent too many API calls
            clearTimeout(this.thresholdTimeout);
            this.thresholdTimeout = setTimeout(() => {
                this.reprocessCurrentImage();
            }, 300);
        });
        
        // Tab panel handlers - Enhanced for direct tab navigation
        this.objectsTab.addEventListener('click', () => this.switchTab('objects'));
        this.statsTab.addEventListener('click', () => this.switchTab('stats'));
        this.audioTab.addEventListener('click', () => this.switchTab('audio'));
        
    }

/* ==============================================
        Tab Switching Logic under Detection Section
    ================================================== */

    switchTab(tabId) {
        // Remove active class from all tabs
        [this.objectsTab, this.statsTab, this.audioTab].forEach(tab => 
            tab.classList.remove('active'));
        
        // Hide all panes first
        this.objectsTabPane.style.display = 'none';
        this.statsTabPane.style.display = 'none';
        this.audioTabPane.style.display = 'none';
        
        // Add active class to selected tab and show only its pane
        if (tabId === 'objects') {
            this.objectsTab.classList.add('active');
            this.objectsTabPane.style.display = 'block';
        } else if (tabId === 'stats') {
            this.statsTab.classList.add('active');
            this.statsTabPane.style.display = 'block';
            // Refresh stats content if we have results
            if (this.detectionResults) {
                this.updateStats(this.detectionResults);
            }
        } else if (tabId === 'audio') {
            this.audioTab.classList.add('active');
            this.audioTabPane.style.display = 'block';
        }
    }

  
    async handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            // Show loading overlay
            this.loadingOverlay.style.display = 'flex';
            
            // Read the image file
            const imageDataUrl = await this.readFileAsDataURL(file);
            this.currentImageDataUrl = imageDataUrl; // Store for later reprocessing
            
            // Load image to get dimensions
            const img = await this.loadImage(imageDataUrl);
            
            // Set canvas dimensions
            this.detectedCanvas.width = img.width;
            this.detectedCanvas.height = img.height;
            
            // Draw original image on canvas
            this.ctx.drawImage(img, 0, 0);
            
            // Get selected model and confidence threshold
            const model = this.modelSelect.value;
            const confidenceThreshold = parseInt(this.thresholdRange.value) / 100;
            
            // Process the image
            await this.processImage(imageDataUrl, model, confidenceThreshold);
            
            // Enable screenshot button
            this.screenshotBtn.disabled = false;
            
            // Hide loading overlay
            this.loadingOverlay.style.display = 'none';
        } catch (error) {
            console.error('Error processing image:', error);
            this.showError('Failed to process image. Please try again.');
            this.loadingOverlay.style.display = 'none';
        }
    }
    
    async reprocessCurrentImage() {
        // If no image is loaded or processing is already happening, do nothing
        if (!this.currentImageDataUrl || this.processingLock) return;
        
        this.processingLock = true;
        
        try {
            // Show loading overlay
            this.loadingOverlay.style.display = 'flex';
            
            // Get current settings
            const model = this.modelSelect.value;
            const confidenceThreshold = parseInt(this.thresholdRange.value) / 100;
            
            // Reprocess with new settings
            await this.processImage(this.currentImageDataUrl, model, confidenceThreshold);
            
            // Hide loading overlay
            this.loadingOverlay.style.display = 'none';
        } catch (error) {
            console.error('Error reprocessing image:', error);
            this.showError('Failed to reprocess image. Please try again.');
            this.loadingOverlay.style.display = 'none';
        } finally {
            this.processingLock = false;
        }
    }

    async runLiveDetection() {
    if (!this.stream || !this.liveVideo.srcObject) return;
    
    try {
        // Create temporary canvas to capture frame
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.liveVideo.videoWidth;
        tempCanvas.height = this.liveVideo.videoHeight;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Handle the mirroring when taking screenshot - since we're flipping the video display
        // we need to flip the canvas capture as well for consistency
        tempCtx.translate(tempCanvas.width, 0);
        tempCtx.scale(-1, 1);
        tempCtx.drawImage(this.liveVideo, 0, 0);
        
        // Convert to data URL
        const imageDataUrl = tempCanvas.toDataURL('image/jpeg');
        this.currentImageDataUrl = imageDataUrl; // Store for later reprocessing
        
        // Get selected model and confidence threshold
        const model = this.modelSelect.value;
        const confidenceThreshold = parseInt(this.thresholdRange.value) / 100;
        
        // Process the image but don't show loading overlay for live detection
        // to avoid flickering UI during continuous detection
        
        // Make API request to backend
        const response = await fetch(`${this.apiUrl}/detect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                image: imageDataUrl,
                model: selectedModel,
                confidence: confidenceThreshold
            })
        });
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }
        
        const data = await response.json();
        
        // Store results for use in other tabs
        this.detectionResults = data;
        
        // Update object list
        this.updateObjectList(data.grouped_objects);
        
        // Update stats if stats tab is active
        if (this.statsTab.classList.contains('active')) {
            this.updateStats(data);
        }
        
    } catch (error) {
        console.error('Live detection error:', error);
        // Don't show error messages during live detection to avoid
        // disrupting the user experience with error popups
    }
    }
    
    
    captureScreenshot() {
        if (!this.stream && this.liveVideo.style.display !== 'block') return;
        
        try {
            // Show loading overlay
            this.loadingOverlay.style.display = 'flex';
            
            // Create temporary canvas to capture frame
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.liveVideo.videoWidth;
            tempCanvas.height = this.liveVideo.videoHeight;
            const tempCtx = tempCanvas.getContext('2d');
            
            // FIX: Handle the mirroring when taking screenshot if needed
            // If the video is not mirrored (as we fixed above), we don't need to flip the canvas
            tempCtx.translate(tempCanvas.width, 0);
            tempCtx.scale(-1, 1);
            tempCtx.drawImage(this.liveVideo, 0, 0);

            
            // Convert to data URL
            const imageDataUrl = tempCanvas.toDataURL('image/jpeg');
            this.currentImageDataUrl = imageDataUrl; // Store for later reprocessing
            
            // Set canvas dimensions
            this.detectedCanvas.width = tempCanvas.width;
            this.detectedCanvas.height = tempCanvas.height;
            
            // Draw captured frame on main canvas
            this.ctx.drawImage(tempCanvas, 0, 0);
            
            // Stop video stream
            this.stopVideoStream();
            
            // Show canvas
            this.detectedCanvas.style.display = 'block';
            
            // Get selected model and confidence threshold
            const model = this.modelSelect.value;
            const confidenceThreshold = parseInt(this.thresholdRange.value) / 100;
            
            // Process the image
            this.processImage(imageDataUrl, model, confidenceThreshold);
            
        } catch (error) {
            console.error('Error capturing screenshot:', error);
            this.showError('Failed to capture image. Please try again.');
            this.loadingOverlay.style.display = 'none';
        }
    }
    async toggleLiveCapture() {
        if (!this.isLiveDetectionRunning) {
            try {
                this.stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { 
                        facingMode: 'environment',
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    } 
                });
    
                this.liveVideo.srcObject = this.stream;
                this.liveVideo.style.display = 'block';
                this.liveVideo.style.transform = 'scaleX(-1)';
                this.liveVideo.play();
    
                this.detectedCanvas.style.display = 'none';
                this.screenshotBtn.disabled = false;
    
                // Change button text to stop detection
                this.liveCaptureBtn.innerHTML = '<i class="bi bi-stop-circle"></i><span>Stop Detection</span>';
    
                this.isLiveDetectionRunning = true;
    
                // Start live detection every 1.5 seconds
                this.liveDetectionInterval = setInterval(() => this.runLiveDetection(), 1500);
    
            } catch (error) {
                console.error('Error accessing camera:', error);
                this.showError('Could not access camera. Please check permissions.');
            }
        } else {
            // Stop live detection
            clearInterval(this.liveDetectionInterval);
            this.liveDetectionInterval = null;
            this.isLiveDetectionRunning = false;
    
            // Stop video stream
            this.stopVideoStream();
    
            // Reset button text
            this.liveCaptureBtn.innerHTML = '<i class="bi bi-camera-video"></i><span>Live Camera</span>';
        }
    }
    
    stopVideoStream() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
            this.liveVideo.style.display = 'none';
            this.liveCaptureBtn.innerHTML = '<i class="bi bi-camera-video"></i><span>Live Camera</span>';
        }
    }
    
    async processImage(imageDataUrl, selectedModel, confidenceThreshold) {
        try {
            // Make API request to backend
            const response = await fetch(`${this.apiUrl}/detect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    image: imageDataUrl,
                    model: selectedModel,
                    confidence: confidenceThreshold
                })
            });
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            
            const data = await response.json();
            
            // Store results for use in other tabs
            this.detectionResults = data;
            
            // Get original image from canvas (important to preserve it when reprocessing)
            const originalImage = new Image();
            originalImage.src = imageDataUrl;
            
            // Wait for image to load
            await new Promise(resolve => {
                originalImage.onload = resolve;
            });
            
            // Clear canvas and redraw original image
            this.ctx.clearRect(0, 0, this.detectedCanvas.width, this.detectedCanvas.height);
            this.ctx.drawImage(originalImage, 0, 0, this.detectedCanvas.width, this.detectedCanvas.height);
            
            // Draw detection results
            this.drawDetections(data.detections);
            
            // Update object list
            this.updateObjectList(data.grouped_objects);
            
            // Update stats
            this.updateStats(data);
            
            // Enable audio generation
            this.generateAudioBtn.disabled = false;
            this.generateAudioBtn.onclick = () => this.generateAudioDescription(data.grouped_objects);
            
            // Hide loading overlay
            this.loadingOverlay.style.display = 'none';
            
        } catch (error) {
            console.error('Detection Error:', error);
            this.showError('Detection failed. Please try again.');
            this.loadingOverlay.style.display = 'none';
        }
    }
    
    drawDetections(detections) {
        // Draw each detection
        detections.forEach(detection => {
            const [x, y, width, height] = detection.bbox;
            
            // Draw bounding box
            this.ctx.beginPath();
            this.ctx.rect(x, y, width, height);
            this.ctx.lineWidth = 3;
            this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
            this.ctx.stroke();
            
            // Create label background
            const label = `${detection.class} (${(detection.confidence * 100).toFixed(0)}%)`;
            this.ctx.font = '16px Arial';
            const textWidth = this.ctx.measureText(label).width + 10;
            this.ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
            this.ctx.fillRect(
                x, 
                y > 25 ? y - 25 : y, 
                textWidth, 
                25
            );
            
            // Draw label text
            this.ctx.fillStyle = 'white';
            this.ctx.fillText(
                label, 
                x + 5, 
                y > 25 ? y - 7 : y + 18
            );
        });
    }
    
    updateObjectList(groupedObjects) {
        // Clear previous list
        this.objectList.innerHTML = '';
        
        if (groupedObjects.length === 0) {
            const li = document.createElement('li');
            li.className = 'no-objects';
            li.textContent = 'No objects detected';
            this.objectList.appendChild(li);
            this.objectCounter.textContent = '0';
            return;
        }
        
        // Update counter
        const totalCount = groupedObjects.reduce((sum, obj) => sum + obj.count, 0);
        this.objectCounter.textContent = totalCount;
        
        // Add each object group to the list
        groupedObjects.forEach(group => {
            const li = document.createElement('li');
            
            const confidence = this.detectionResults.detections
                .filter(d => d.class === group.class)
                .reduce((sum, d) => sum + d.confidence, 0) / group.count;
            
            li.innerHTML = `
                <div class="object-info">
                    <div class="object-name">${group.class}</div>
                    <span class="object-confidence">${(confidence * 100).toFixed(0)}% confidence</span>
                </div>
                <div class="object-count">
                    <span>${group.count}</span>
                </div>
            `;
            this.objectList.appendChild(li);
        });
    }
    
    
    // pie chart code is here 
    renderPieChart(groupedObjects) {
    const ctx = document.getElementById('pieChartCanvas').getContext('2d');
    const labels = groupedObjects.map(obj => obj.class);
    const data = groupedObjects.map(obj => obj.count);

    if (this.pieChart) {
        this.pieChart.destroy();  // Remove old chart if exists
    }

    this.pieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#ff6384', '#36a2eb', '#ffcd56', '#4bc0c0',
                    '#9966ff', '#ff9f40', '#e7e9ed', '#71b37c'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                title: {
                    display: true,
                    text: 'Object Type Distribution'
                }
            }
        }
    });
}

    // pie chart code is end 




    updateStats(data) {
        if (!data || !data.grouped_objects) return;
        
        const { detections, grouped_objects } = data;
        
        // Basic stats
        const totalCount = grouped_objects.reduce((sum, obj) => sum + obj.count, 0);
        const categoryCount = grouped_objects.length;
        const avgConfidence = detections.length > 0 
            ? detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length * 100 
            : 0;
        
        // Update DOM
        this.totalObjects.textContent = totalCount;
        this.totalCategories.textContent = categoryCount;
        this.avgConfidence.textContent = `${avgConfidence.toFixed(1)}%`;
        
        // Update chart
        // this.updateChart(grouped_objects);
        this.renderPieChart(data.grouped_objects);

    }
    
    updateChart(groupedObjects) {
        // Only take top 5 categories if more than 5
        let chartData = [...groupedObjects];
        if (chartData.length > 5) {
            chartData.sort((a, b) => b.count - a.count);
            const others = chartData.slice(5).reduce(
                (sum, obj) => sum + obj.count, 0
            );
            chartData = chartData.slice(0, 5);
            if (others > 0) {
                chartData.push({ class: 'Others', count: others });
            }
        }
        
        // Update chart data
        this.chart.data.labels = chartData.map(obj => obj.class);
        this.chart.data.datasets[0].data = chartData.map(obj => obj.count);
        this.chart.update();
    }
    
    // FIX: Improved voice selection logic
    generateAudioDescription(groupedObjects) {
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();
        
        if (groupedObjects.length === 0) return;
        
        // Get settings
        const voiceType = this.voiceTypeSelect.value;
        const speechRate = parseFloat(this.speechRateSelect.value);
        
        // Build description
        let description;
        if (groupedObjects.length === 1) {
            const obj = groupedObjects[0];
            description = `I detected ${obj.count} ${obj.class}${obj.count > 1 ? 's' : ''}.`;
        } else {
            const lastItem = groupedObjects[groupedObjects.length - 1];
            const itemsExceptLast = groupedObjects.slice(0, -1).map(
                obj => `${obj.count} ${obj.class}${obj.count > 1 ? 's' : ''}`
            ).join(', ');
            
            description = `I detected ${itemsExceptLast} and ${lastItem.count} ${lastItem.class}${lastItem.count > 1 ? 's' : ''}.`;
        }
        
        // Create utterance
        const utterance = new SpeechSynthesisUtterance(description);
        
        // Get available voices - use our preloaded ones if available
        const voices = this.availableVoices || window.speechSynthesis.getVoices();
        
        if (!voices || voices.length === 0) {
            // If voices aren't loaded yet, set a flag and try again later
            console.log("No voices available yet, waiting for voices to load...");
            window.speechSynthesis.onvoiceschanged = () => {
                this.availableVoices = window.speechSynthesis.getVoices();
                this.generateAudioDescription(groupedObjects);
            };
            return;
        }
        
        // FIX: Improved voice selection logic
        let selectedVoice;
        
        // Debug available voices
        console.log("Available voices:", voices.map(v => ({name: v.name, lang: v.lang, gender: this.detectVoiceGender(v.name)})));
        
        if (voiceType === 'male') {
            // Try to find an explicitly male voice first
            selectedVoice = voices.find(v => 
                v.name.toLowerCase().includes('male') || 
                v.name.toLowerCase().includes('guy') ||
                v.name.toLowerCase().includes('david') ||
                v.name.toLowerCase().includes('james')
            );
            
            // If no explicit male voice found, use a voice that's not explicitly female
            if (!selectedVoice) {
                selectedVoice = voices.find(v => 
                    !v.name.toLowerCase().includes('female') && 
                    !v.name.toLowerCase().includes('woman') &&
                    !v.name.toLowerCase().includes('girl') &&
                    v.lang.startsWith('en')
                );
            }
        } else { // female
            // Try to find an explicitly female voice first
            selectedVoice = voices.find(v => 
                v.name.toLowerCase().includes('female') || 
                v.name.toLowerCase().includes('woman') ||
                v.name.toLowerCase().includes('girl') ||
                v.name.toLowerCase().includes('samantha') ||
                v.name.toLowerCase().includes('karen')
            );
            
            // If no explicit female voice found, use any English voice as fallback
            if (!selectedVoice) {
                selectedVoice = voices.find(v => v.lang.startsWith('en'));
            }
        }
        
        // If we still couldn't find a voice, use the first available one
        if (!selectedVoice && voices.length > 0) {
            selectedVoice = voices[0];
        }
        
        // Log the selected voice for debugging
        console.log(`Selected ${voiceType} voice:`, selectedVoice ? selectedVoice.name : 'No voice found');
        
        // Set voice and rate
        if (selectedVoice) utterance.voice = selectedVoice;
        utterance.rate = speechRate;
        
        // Speak
        window.speechSynthesis.speak(utterance);
    }
    
    // Helper method to detect gender from voice name
    
    detectVoiceGender(voiceName) {
        
        voiceName = voiceName.toLowerCase();


        if (voiceName.includes('female') || 
            voiceName.includes('woman') || 
            voiceName.includes('girl') ||
            voiceName.includes('samantha') ||
            voiceName.includes('karen') ||
            voiceName.includes('victoria')) {
            return 'female';
        } else if (voiceName.includes('male') || 
                  voiceName.includes('man') || 
                  voiceName.includes('guy') ||
                  voiceName.includes('david') ||
                  voiceName.includes('james')) {
            return 'male';
        } else {
            return 'unknown';
        }
    }
//     generateAudioDescription(groupedObjects) {
//     // Cancel any ongoing speech
//     window.speechSynthesis.cancel();
    
//     if (groupedObjects.length === 0) return;
    
//     // Get settings
//     const voiceType = this.voiceTypeSelect.value;
//     const speechRate = parseFloat(this.speechRateSelect.value);
    
//     // Build description
//     let description;
//     if (groupedObjects.length === 1) {
//         const obj = groupedObjects[0];
//         description = `I detected ${obj.count} ${obj.class}${obj.count > 1 ? 's' : ''}.`;
//     } else {
//         const lastItem = groupedObjects[groupedObjects.length - 1];
//         const itemsExceptLast = groupedObjects.slice(0, -1).map(
//             obj => `${obj.count} ${obj.class}${obj.count > 1 ? 's' : ''}`
//         ).join(', ');
        
//         description = `I detected ${itemsExceptLast} and ${lastItem.count} ${lastItem.class}${lastItem.count > 1 ? 's' : ''}.`;
//     }
    
//     // Create utterance
//     const utterance = new SpeechSynthesisUtterance(description);
    
//     // Get fresh voices list
//     const voices = window.speechSynthesis.getVoices();
    
//     if (!voices || voices.length === 0) {
//         console.log("No voices available yet, waiting for voices to load...");
//         // Store the parameters to retry after voices are loaded
//         this.pendingAudioDescription = {
//             groupedObjects,
//             voiceType,
//             speechRate
//         };
        
//         // Set up a one-time event handler for voices loaded
//         window.speechSynthesis.onvoiceschanged = () => {
//             if (this.pendingAudioDescription) {
//                 const params = this.pendingAudioDescription;
//                 this.pendingAudioDescription = null; // Clear pending request
//                 this.generateAudioDescription(params.groupedObjects);
//             }
//         };
//         return;
//     }
    
//     // Log available voices for debugging
//     console.log("Available voices:", voices.map(v => ({
//         name: v.name, 
//         lang: v.lang
//     })));
    
//     // Find an appropriate voice based on gender preference
//     let selectedVoice = this.findVoiceByGender(voices, voiceType);
    
//     // If we still couldn't find a voice, use the first available English one or any voice
//     if (!selectedVoice) {
//         selectedVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
//     }
    
//     // Log the selected voice for debugging
//     console.log(`Selected ${voiceType} voice:`, selectedVoice ? selectedVoice.name : 'No voice found');
    
//     // Set voice and rate
//     if (selectedVoice) utterance.voice = selectedVoice;
//     utterance.rate = speechRate;
    
//     // Speak
//     window.speechSynthesis.speak(utterance);
// }

// findVoiceByGender(voices, gender) {
//     // First try: look for explicit gender indicators in voice name
//     let voice = null;
    
//     if (gender === 'male') {
//         // Try to find voices with explicit male indicators
//         voice = voices.find(v => 
//             this.isMaleVoice(v.name) && v.lang.startsWith('en')
//         );
        
//         // If no English male voice, try any male voice
//         if (!voice) {
//             voice = voices.find(v => this.isMaleVoice(v.name));
//         }
        
//         // If still no voice found, try to find a voice that's likely male based on name
//         if (!voice) {
//             voice = voices.find(v => 
//                 !this.isFemaleVoice(v.name) && 
//                 v.lang.startsWith('en') &&
//                 (v.name.includes('David') || 
//                  v.name.includes('James') || 
//                  v.name.includes('Tom') ||
//                  v.name.includes('Daniel'))
//             );
//         }
//     } else { // female
//         // Try to find voices with explicit female indicators
//         voice = voices.find(v => 
//             this.isFemaleVoice(v.name) && v.lang.startsWith('en')
//         );
        
//         // If no English female voice, try any female voice
//         if (!voice) {
//             voice = voices.find(v => this.isFemaleVoice(v.name));
//         }
        
//         // If still no voice found, try to find a voice that's likely female based on name
//         if (!voice) {
//             voice = voices.find(v => 
//                 !this.isMaleVoice(v.name) && 
//                 v.lang.startsWith('en') &&
//                 (v.name.includes('Samantha') || 
//                  v.name.includes('Victoria') || 
//                  v.name.includes('Karen') ||
//                  v.name.includes('Lisa'))
//             );
//         }
//     }
    
//     return voice;
// }

isMaleVoice(voiceName) {
    voiceName = voiceName.toLowerCase();
    return voiceName.includes('male') || 
           voiceName.includes('man') || 
           voiceName.includes('guy') ||
           voiceName.includes('david') ||
           voiceName.includes('james') ||
           voiceName.includes('tom') ||
           voiceName.includes('daniel');
}

isFemaleVoice(voiceName) {
    voiceName = voiceName.toLowerCase();
    return voiceName.includes('female') || 
           voiceName.includes('woman') || 
           voiceName.includes('girl') ||
           voiceName.includes('samantha') ||
           voiceName.includes('karen') ||
           voiceName.includes('victoria') ||
           voiceName.includes('lisa');
}
    
    showError(message) {
        this.objectList.innerHTML = `
            <li class="no-objects error">
                <i class="bi bi-exclamation-triangle"></i>
                ${message}
            </li>
        `;
    }
    
    // Utility methods
    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(e);
            reader.readAsDataURL(file);
        });
    }
    
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }
}

// Smooth Scrolling for Navigation
function initSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Don't scroll for modal triggers
            if (this.getAttribute('data-bs-toggle') === 'modal') return;
            
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                const navbarHeight = document.querySelector('.navbar').offsetHeight;
                const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - navbarHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// Animation on scroll using GSAP
function initScrollAnimations() {
    // Register ScrollTrigger plugin
    gsap.registerPlugin(ScrollTrigger);
    
    // Animate feature cards
    const featureCards = document.querySelectorAll('.feature-card');
    featureCards.forEach((card, index) => {
        gsap.fromTo(
            card, 
            { y: 50, opacity: 0 }, 
            {
                y: 0,
                opacity: 1,
                duration: 0.6,
                delay: index * 0.1,
                scrollTrigger: {
                    trigger: card,
                    start: "top 85%",
                    toggleActions: "play none none none"
                }
            }
        );
    });
    
    // Animate team cards
    const teamCards = document.querySelectorAll('.team-card');
    teamCards.forEach((card, index) => {
        gsap.fromTo(
            card, 
            { y: 50, opacity: 0 }, 
            {
                y: 0,
                opacity: 1,
                duration: 0.6,
                delay: index * 0.1,
                scrollTrigger: {
                    trigger: card,
                    start: "top 85%",
                    toggleActions: "play none none none"
                }
            }
        );
    });
    
    // Animate section headers
    const sectionHeaders = document.querySelectorAll('.section-header');
    sectionHeaders.forEach((header) => {
        gsap.fromTo(
            header, 
            { y: 30, opacity: 0 }, 
            {
                y: 0,
                opacity: 1,
                duration: 0.8,
                scrollTrigger: {
                    trigger: header,
                    start: "top 85%",
                    toggleActions: "play none none none"
                }
            }
        );
    });
}

// Navbar background on scroll
function initNavbarScroll() {
    const navbar = document.querySelector('.navbar');
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

// Document Ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize particle background
    new ParticleBackground('particleCanvas');
    
    // Initialize vision AI detector
    const detector = new VisionAIDetector();
    
    // Initialize smooth scrolling
    initSmoothScrolling();
    
    // Initialize animations
    initScrollAnimations();
    
    // Initialize navbar scroll effect
    initNavbarScroll();
    
    // Handle voice API loading
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
});
