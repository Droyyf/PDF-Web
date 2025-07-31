// PDF Composer Web - JavaScript Application

class PDFComposerApp {
    constructor() {
        this.currentPDF = null;
        this.currentPage = 0;
        this.totalPages = 0;
        this.thumbnails = [];
        this.selectedCitations = new Set();
        this.selectedCover = null;
        this.fileId = null;
        this.currentPreviewPage = null;
        this.progressInterval = null; // Track progress interval
        this.isProcessing = false;
        this.processingStartTime = null;
        this.pdfWorker = null;
        this.currentTaskId = null;
        this.workerSupported = typeof Worker !== 'undefined';
        this.pdfArrayBuffer = null; // Store PDF data for worker processing
        
        // Cover transform state
        this.coverTransform = {
            x: 0,
            y: 0,
            scale: 0.25, // 25% initial size
            isDragging: false,
            isResizing: false,
            startX: 0,
            startY: 0,
            startScale: 0.25,
            originalWidth: 0,
            originalHeight: 0,
            minScale: 0.1,
            maxScale: 2.0
        };
        
        // Overlay mode state
        this.overlayMode = 'custom'; // 'custom' or 'sidebyside'
        
        // Delay initialization to ensure DOM is ready
        setTimeout(() => this.initializeApp(), 100);
    }

    initializeApp() {
        console.log('Initializing PDF Composer App...');
        this.setupPDFJS();
        this.setupEventListeners();
        this.showEmptyState();
    }

    setupPDFJS() {
        // Set up PDF.js worker - check if pdfjsLib is available
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        } else {
            console.error('PDF.js library not loaded');
        }
        
        // Initialize thumbnail generation worker
        this.initializeThumbnailWorker();
    }
    
    initializeThumbnailWorker() {
        if (this.workerSupported) {
            try {
                this.thumbnailWorker = new Worker('./pdf-worker.js');
                this.setupWorkerMessageHandlers();
                console.log('PDF thumbnail worker initialized successfully');
            } catch (error) {
                console.warn('Failed to initialize Web Worker, falling back to main thread:', error);
                this.workerSupported = false;
            }
        } else {
            console.log('Web Workers not supported, using main thread processing');
        }
    }
    
    setupWorkerMessageHandlers() {
        if (!this.thumbnailWorker) return;
        
        this.thumbnailWorker.addEventListener('message', (event) => {
            const { type, taskId, progress, message, thumbnails, error } = event.data;
            
            // Ignore messages from old tasks
            if (taskId && taskId !== this.currentTaskId) {
                return;
            }
            
            switch (type) {
                case 'PROGRESS':
                    this.updateProgress(progress, message);
                    // If thumbnails are provided in batches, add them immediately
                    if (thumbnails && thumbnails.length > 0) {
                        this.processThumbnailBatch(thumbnails);
                    }
                    break;
                    
                case 'COMPLETE':
                    console.log('Worker completed thumbnail generation');
                    if (thumbnails) {
                        this.thumbnails = thumbnails;
                    }
                    this.onThumbnailGenerationComplete();
                    break;
                    
                case 'ERROR':
                    console.error('Worker error:', error);
                    this.onThumbnailGenerationError(error);
                    break;
                    
                case 'CANCELLED':
                    console.log('Worker task cancelled:', message);
                    this.onThumbnailGenerationCancelled();
                    break;
                    
                case 'HEARTBEAT':
                    // Worker is alive and responsive
                    break;
                    
                default:
                    console.log('Unknown worker message type:', type);
            }
        });
        
        this.thumbnailWorker.addEventListener('error', (error) => {
            console.error('Worker error:', error);
            this.onThumbnailGenerationError(error);
        });
    }
    
    processThumbnailBatch(thumbnails) {
        // Process thumbnails as they arrive from worker
        for (const thumbnail of thumbnails) {
            if (thumbnail.renderData) {
                // Handle fallback rendering for browsers without OffscreenCanvas
                this.renderThumbnailFallback(thumbnail);
            }
            
            // Add to thumbnails array if not already present
            const existingIndex = this.thumbnails.findIndex(t => t.page === thumbnail.page);
            if (existingIndex >= 0) {
                this.thumbnails[existingIndex] = thumbnail;
            } else {
                this.thumbnails.push(thumbnail);
            }
        }
        
        // Update UI with new thumbnails
        this.renderThumbnails();
    }
    
    async renderThumbnailFallback(thumbnail) {
        // Fallback rendering for browsers that don't support OffscreenCanvas in workers
        if (!thumbnail.renderData || !this.currentPDF) return;
        
        try {
            const page = await this.currentPDF.getPage(thumbnail.page + 1);
            const viewport = page.getViewport({ scale: thumbnail.renderData.viewport.scale });
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            
            // Set canvas to exact rendered size (no extra space)
            canvas.width = Math.round(viewport.width);
            canvas.height = Math.round(viewport.height);
            
            // Fill with white background for clean edges
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
            
            thumbnail.buffer = canvas.toDataURL('image/png');
            thumbnail.renderData = null; // Clear render data
            
            page.cleanup();
        } catch (error) {
            console.error('Fallback rendering failed for page', thumbnail.page, error);
        }
    }
    
    onThumbnailGenerationComplete() {
        console.log('All thumbnails generated successfully');
        
        // Hide thumbnail loading state
        const loadingElement = document.getElementById('thumbnailsLoading');
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
        
        this.renderThumbnails();
        this.completeProgress();
        
        // Small delay to show 100% completion, then show PDF viewer
        setTimeout(() => {
            this.showPDFViewer();
        }, 500);
        
        // Clear processing state
        this.isProcessing = false;
        this.processingStartTime = null;
        this.currentTaskId = null;
        this.stopBackgroundKeepAlive();
    }
    
    onThumbnailGenerationError(error) {
        console.error('Thumbnail generation failed:', error);
        
        // Hide thumbnail loading state
        const loadingElement = document.getElementById('thumbnailsLoading');
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
        
        // Create placeholder thumbnails
        this.thumbnails = Array.from({ length: this.totalPages }, (_, i) => ({
            page: i,
            buffer: null,
            width: 200,
            height: 300,
            error: 'Generation failed'
        }));
        
        this.renderThumbnails();
        this.completeProgress();
        
        setTimeout(() => {
            this.showPDFViewer();
        }, 500);
        
        // Clear processing state
        this.isProcessing = false;
        this.processingStartTime = null;
        this.currentTaskId = null;
        this.stopBackgroundKeepAlive();
    }
    
    onThumbnailGenerationCancelled() {
        console.log('Thumbnail generation was cancelled');
        
        // Clear processing state
        this.isProcessing = false;
        this.processingStartTime = null;
        this.currentTaskId = null;
        this.stopBackgroundKeepAlive();
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // File input
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.addEventListener('change', this.handleFileSelect.bind(this));
            console.log('File input listener added');
        } else {
            console.error('File input not found');
        }

        // Center upload button only
        const chooseFileBtn = document.getElementById('chooseFileBtn');
        
        if (chooseFileBtn) {
            chooseFileBtn.addEventListener('click', () => {
                console.log('Choose file button clicked');
                if (fileInput) {
                    fileInput.click();
                } else {
                    console.error('File input not found when button clicked');
                }
            });
            console.log('Choose file button listener added');
        } else {
            console.error('Choose file button not found');
        }

        // PDF navigation removed - using preview only


        // Selection panel controls
        const closeSelectionBtn = document.getElementById('closeSelection');
        const composeBtnEl = document.getElementById('composeBtn');
        
        if (closeSelectionBtn) {
            closeSelectionBtn.addEventListener('click', this.closeSelectionPanel.bind(this));
        }
        if (composeBtnEl) {
            composeBtnEl.addEventListener('click', this.composePDF.bind(this));
        }

        // Enhanced Preview panel controls
        const togglePreviewBtn = document.getElementById('togglePreview');
        const exportPreviewBtn = document.getElementById('exportPreviewBtn');
        const resetCoverBtn = document.getElementById('resetCoverBtn');
        
        if (togglePreviewBtn) {
            togglePreviewBtn.addEventListener('click', this.togglePreview.bind(this));
        }
        if (exportPreviewBtn) {
            exportPreviewBtn.addEventListener('click', this.exportComposition.bind(this));
            console.log('Export button event listener added successfully');
        } else {
            console.error('Export button not found during setup');
        }
        if (resetCoverBtn) {
            resetCoverBtn.addEventListener('click', this.resetCoverTransform.bind(this));
        }
        
        // Enhanced mode switcher buttons
        const modeSwitcher = document.getElementById('modeSwitcher');
        if (modeSwitcher) {
            modeSwitcher.addEventListener('click', (e) => {
                if (e.target.classList.contains('mode-btn') || e.target.closest('.mode-btn')) {
                    const modeBtn = e.target.classList.contains('mode-btn') ? e.target : e.target.closest('.mode-btn');
                    const mode = modeBtn.dataset.mode;
                    this.handleModeSwitch(mode);
                }
            });
            console.log('Mode switcher event listener added successfully');
        }
        
        // Legacy overlay mode selector (fallback)
        const overlayModeSelect = document.getElementById('overlayModeSelect');
        if (overlayModeSelect) {
            overlayModeSelect.addEventListener('change', this.handleOverlayModeChange.bind(this));
            console.log('Legacy overlay mode selector event listener added successfully');
        }
        
        // Cover placement change handler
        const coverPlacementSelect = document.getElementById('coverPlacement');
        if (coverPlacementSelect) {
            coverPlacementSelect.addEventListener('change', () => {
                if (!document.getElementById('previewPanel').classList.contains('hidden')) {
                    this.generateCompositionPreview();
                }
            });
        }

        // Page Visibility API - prevent processing interruption when tab switches
        this.setupBackgroundProcessingSupport();
        
        // Initialize Web Worker for background processing
        this.initializeWorker();

        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyPress.bind(this));
    }

    setupBackgroundProcessingSupport() {
        // Enhanced Page Visibility API handling
        if (typeof document.visibilityState !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                this.handleVisibilityChange();
            });
        }

        // Prevent page unload during processing
        window.addEventListener('beforeunload', (event) => {
            if (this.isProcessing) {
                const message = 'PDF is still processing. Are you sure you want to leave?';
                event.preventDefault();
                event.returnValue = message;
                return message;
            }
        });

        // Enhanced browser throttling detection and mitigation
        this.setupThrottlingDetection();
        
        // Wake Lock API for keeping tab active (if supported)
        this.initializeWakeLock();
        
        // Focus/blur events for additional tab state tracking
        window.addEventListener('focus', () => this.handleTabFocus());
        window.addEventListener('blur', () => this.handleTabBlur());
        
        // Cleanup on page unload
        window.addEventListener('unload', () => this.cleanup());
        window.addEventListener('pagehide', () => this.cleanup());
    }
    
    handleVisibilityChange() {
        const isHidden = document.visibilityState === 'hidden';
        
        if (this.isProcessing) {
            if (isHidden) {
                console.log('Tab became inactive during processing - activating background preservation');
                this.activateBackgroundPreservation();
            } else {
                console.log('Tab became active again - deactivating background preservation');
                this.deactivateBackgroundPreservation();
                // Send ping to worker to ensure it's still responsive
                this.pingWorker();
            }
        }
    }
    
    handleTabFocus() {
        if (this.isProcessing) {
            console.log('Tab gained focus during processing');
            this.deactivateBackgroundPreservation();
            this.pingWorker();
        }
    }
    
    handleTabBlur() {
        if (this.isProcessing) {
            console.log('Tab lost focus during processing');
            this.activateBackgroundPreservation();
        }
    }
    
    activateBackgroundPreservation() {
        // Multiple strategies to keep processing alive in background
        this.startBackgroundKeepAlive();
        this.requestWakeLock();
        this.startHeartbeat();
        
        // Additional mitigation for throttling
        if (this.thumbnailWorker) {
            // Worker continues processing regardless of tab state
            console.log('Worker-based processing continues in background');
        }
    }
    
    deactivateBackgroundPreservation() {
        this.stopBackgroundKeepAlive();
        this.releaseWakeLock();
        this.stopHeartbeat();
    }
    
    setupThrottlingDetection() {
        // Detect when browser is throttling setTimeout/setInterval
        this.throttlingDetectionInterval = null;
        this.lastHeartbeat = Date.now();
        this.heartbeatInterval = null;
    }
    
    startHeartbeat() {
        if (this.heartbeatInterval) return;
        
        this.heartbeatInterval = setInterval(() => {
            const now = Date.now();
            const timeSinceLastBeat = now - this.lastHeartbeat;
            
            // If more than 2 seconds have passed, we might be throttled
            if (timeSinceLastBeat > 2000) {
                console.warn('Possible browser throttling detected:', timeSinceLastBeat + 'ms gap');
                
                // Additional mitigation strategies
                this.mitigateThrottling();
            }
            
            this.lastHeartbeat = now;
            
            // Update title to show we're still alive
            if (this.isProcessing && document.visibilityState === 'hidden') {
                const elapsed = Math.floor((Date.now() - this.processingStartTime) / 1000);
                document.title = `PDF Composer - Processing... (${elapsed}s)`;
            }
        }, 1000);
    }
    
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    
    mitigateThrottling() {
        // Use multiple timer strategies to combat throttling
        
        // Strategy 1: MessageChannel for immediate scheduling
        if (typeof MessageChannel !== 'undefined') {
            const channel = new MessageChannel();
            channel.port2.postMessage(null);
        }
        
        // Strategy 2: requestAnimationFrame with forced frame
        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => {
                // Force a frame even when hidden
            });
        }
        
        // Strategy 3: Worker heartbeat
        this.pingWorker();
    }
    
    pingWorker() {
        if (this.thumbnailWorker && this.currentTaskId) {
            this.thumbnailWorker.postMessage({
                type: 'PING',
                taskId: this.currentTaskId
            });
        }
    }

    async initializeWakeLock() {
        // Initialize wake lock support detection
        this.wakeLockSupported = 'wakeLock' in navigator;
        this.wakeLock = null;
        
        if (this.wakeLockSupported) {
            console.log('Wake Lock API is supported');
        } else {
            console.log('Wake Lock API not supported in this browser');
        }
    }
    
    async requestWakeLock() {
        if (!this.wakeLockSupported || this.wakeLock) return;
        
        try {
            this.wakeLock = await navigator.wakeLock.request('screen');
            console.log('Screen wake lock acquired');
            
            // Handle wake lock release
            this.wakeLock.addEventListener('release', () => {
                console.log('Screen wake lock was released');
                this.wakeLock = null;
            });
            
        } catch (err) {
            console.warn('Could not acquire screen wake lock:', err);
        }
    }
    
    async releaseWakeLock() {
        if (this.wakeLock) {
            try {
                await this.wakeLock.release();
                this.wakeLock = null;
                console.log('Screen wake lock released');
            } catch (err) {
                console.warn('Could not release screen wake lock:', err);
            }
        }
    }

    async startBackgroundKeepAlive() {
        // Simplified keep-alive - just update title periodically
        if (!this.keepAliveInterval) {
            this.keepAliveInterval = setInterval(() => {
                // Update title with current time to show activity
                if (this.isProcessing) {
                    const elapsed = Math.floor((Date.now() - this.processingStartTime) / 1000);
                    document.title = `PDF Composer - Processing... (${elapsed}s)`;
                }
            }, 5000); // Every 5 seconds
        }
    }

    stopBackgroundKeepAlive() {
        // Clear keep-alive interval
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }

    initializeWorker() {
        if (this.workerSupported) {
            try {
                this.pdfWorker = new Worker('./pdf-worker.js');
                this.pdfWorker.addEventListener('message', this.handleWorkerMessage.bind(this));
                this.pdfWorker.addEventListener('error', (error) => {
                    console.error('PDF Worker error:', error);
                    this.workerSupported = false;
                    this.pdfWorker = null;
                });
                console.log('PDF Worker initialized successfully');
            } catch (error) {
                console.error('Failed to initialize PDF Worker:', error);
                this.workerSupported = false;
                this.pdfWorker = null;
            }
        }
    }

    handleWorkerMessage(event) {
        const { type, data, taskId, progress, message, pageNum, totalPages, thumbnails, error } = event.data;
        
        // Only process messages for current task
        if (taskId !== this.currentTaskId) return;
        
        switch (type) {
            case 'PDF_LOADED':
                console.log('PDF loaded in worker, total pages:', data?.totalPages || totalPages);
                break;
                
            case 'PROGRESS':
                this.updateProgress(progress, message);
                if (pageNum % 10 === 0) {
                    console.log(`Generated ${pageNum}/${totalPages} thumbnails`);
                    document.title = `PDF Composer - Loading ${Math.round(progress)}%`;
                }
                break;
                
            case 'THUMBNAILS_BATCH':
                // Add batch of thumbnails to our array
                for (const thumbnail of thumbnails) {
                    this.thumbnails[thumbnail.page] = thumbnail;
                }
                this.updateThumbnailUI();
                break;
                
            case 'THUMBNAILS_COMPLETE':
                console.log('All thumbnails generated successfully via worker');
                this.finalizeThumbnailGeneration();
                break;
                
            case 'ERROR':
                console.error('Worker error:', error);
                this.handleWorkerError(error);
                break;
                
            case 'CANCELLED':
                console.log('Worker task cancelled');
                break;
        }
    }

    finalizeThumbnailGeneration() {
        // Restore original title
        document.title = 'PDF Composer Web';
        
        // Clear processing state
        this.isProcessing = false;
        this.processingStartTime = null;
        this.stopBackgroundKeepAlive();
        
        // Update UI
        this.updateThumbnailUI();
        this.updateProgress(100, 'PDF loaded successfully!');
    }

    handleWorkerError(error) {
        console.error('Worker failed, falling back to main thread processing:', error);
        this.workerSupported = false;
        this.pdfWorker = null;
        
        // Fall back to main thread processing
        this.generateAllThumbnails();
    }

    handleKeyPress(event) {
        if (!this.currentPDF) return;

        switch (event.key) {
            case 'ArrowLeft':
                event.preventDefault();
                this.previousPage();
                break;
            case 'ArrowRight':
                event.preventDefault();
                this.nextPage();
                break;
        }
    }

    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file || file.type !== 'application/pdf') {
            this.showToast('Please select a valid PDF file', 'error');
            return;
        }

        if (file.size > 50 * 1024 * 1024) { // 50MB limit
            this.showToast('File size exceeds 50MB limit', 'error');
            return;
        }

        this.showLoadingState();
        this.updateProgress(5, 'File selected, starting upload...');
        
        // Set up a timeout to prevent infinite loading
        const loadingTimeout = setTimeout(() => {
            console.error('PDF loading timed out after 2 minutes');
            this.showToast('PDF loading timed out. Please try a smaller PDF file.', 'error');
            this.showEmptyState();
        }, 120000); // 2 minute timeout for very large files
        
        try {
            await this.uploadPDF(file);
            clearTimeout(loadingTimeout); // Clear timeout if successful
        } catch (error) {
            clearTimeout(loadingTimeout); // Clear timeout on error
            console.error('Upload error:', error);
            this.showToast('Failed to upload PDF: ' + error.message, 'error');
            this.showEmptyState();
        }
    }

    async uploadPDF(file) {
        const formData = new FormData();
        formData.append('pdf', file);

        try {
            console.log('Uploading PDF to server...');
            this.updateProgress(10, 'Uploading PDF to server...');
            
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            this.updateProgress(25, 'Processing PDF on server...');
            const result = await response.json();
            
            if (result.success) {
                this.fileId = result.fileId;
                this.totalPages = result.pageCount;
                this.thumbnails = result.thumbnails;
                
                this.updateProgress(30, 'Upload complete, loading PDF for viewing...');
                console.log('Upload successful, loading PDF for viewing...');
                await this.loadPDFForViewing(file);
                this.updateTechnicalInfo(result.filename, result.pageCount);
                this.showToast('PDF loaded successfully', 'success');
            } else {
                throw new Error(result.error || 'Upload failed');
            }
        } catch (error) {
            console.error('Upload process failed at step:', error.message);
            throw new Error(`Network error: ${error.message}`);
        }
    }

    async loadPDFForViewing(file) {
        try {
            console.log('Loading PDF for viewing, file size:', file.size, 'bytes');
            
            // Check if PDF.js is available
            if (typeof pdfjsLib === 'undefined') {
                console.error('PDF.js library not loaded - checking script tags...');
                const scripts = Array.from(document.scripts);
                const pdfJsScript = scripts.find(s => s.src.includes('pdf.min.js'));
                console.error('PDF.js script found:', !!pdfJsScript);
                if (pdfJsScript) {
                    console.error('PDF.js script src:', pdfJsScript.src);
                    console.error('PDF.js script loaded:', pdfJsScript.readyState);
                }
                throw new Error('PDF.js library not loaded');
            }
            
            console.log('PDF.js library available, loading document...');
            this.updateProgress(35, 'Loading PDF document...');

            const arrayBuffer = await file.arrayBuffer();
            this.pdfArrayBuffer = arrayBuffer; // Store for worker processing
            this.updateProgress(40, 'Parsing PDF structure...');
            
            this.currentPDF = await pdfjsLib.getDocument(arrayBuffer).promise;
            console.log('PDF document loaded successfully:', this.currentPDF.numPages, 'pages');
            
            // Verify page count matches
            if (this.totalPages !== this.currentPDF.numPages) {
                console.warn('Page count mismatch - server:', this.totalPages, 'client:', this.currentPDF.numPages);
                this.totalPages = this.currentPDF.numPages;
            }
            
            this.currentPage = 0;
            
            // Generate thumbnails for all pages
            this.updateProgress(50, 'PDF loaded, generating thumbnails...');
            console.log('Generating thumbnails...');
            await this.generateAllThumbnails();
            
            this.renderThumbnails();
            
            // Complete the progress before showing PDF viewer
            this.completeProgress();
            
            // Small delay to show 100% completion, then show PDF viewer
            setTimeout(() => {
                this.showPDFViewer();
                
                // Initialize preview with first page
                this.currentPreviewPage = 0;
                this.updatePreview();
                
                console.log('PDF loading complete');
            }, 500);
            
        } catch (error) {
            console.error('PDF loading error:', error);
            console.error('Error stack:', error.stack);
            
            // Clear progress and show error state
            if (this.progressInterval) {
                clearInterval(this.progressInterval);
                this.progressInterval = null;
            }
            
            throw new Error(`Failed to load PDF for viewing: ${error.message}`);
        }
    }

    async generateAllThumbnails() {
        if (!this.currentPDF) return;

        console.log('Generating thumbnails for', this.totalPages, 'pages...');
        this.thumbnails = [];

        // Set processing state
        this.isProcessing = true;
        this.processingStartTime = Date.now();

        // Use simple main thread processing with enhanced background support
        await this.generateThumbnailsMainThread();
    }
    
    async generateThumbnailsWithWorker() {
        try {
            console.log('Using Web Worker for thumbnail generation');
            
            // Generate unique task ID
            this.currentTaskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            // Convert PDF to ArrayBuffer for worker
            const pdfArrayBuffer = await this.getPDFArrayBuffer();
            
            // Send task to worker
            this.pdfWorker.postMessage({
                type: 'GENERATE_THUMBNAILS',
                taskId: this.currentTaskId,
                data: {
                    pdfData: pdfArrayBuffer,
                    totalPages: this.totalPages,
                    options: {
                        batchSize: Math.max(1, Math.min(10, Math.floor(this.totalPages / 20))), // Dynamic batch size
                        totalPages: this.totalPages
                    }
                }
            });
            
            // Worker will handle progress updates and completion via message handlers
            
        } catch (error) {
            console.error('Worker processing failed, falling back to main thread:', error);
            this.workerSupported = false;
            await this.generateThumbnailsMainThread();
        }
    }
    
    async getPDFArrayBuffer() {
        // Get the PDF data as ArrayBuffer for worker processing
        
        // First try to get from the loaded PDF document
        if (this.currentPDF && this.currentPDF._transport && this.currentPDF._transport._source) {
            const source = this.currentPDF._transport._source;
            if (source.data) {
                return source.data;
            }
        }
        
        // Try to get from stored buffer if available
        if (this.pdfArrayBuffer) {
            return this.pdfArrayBuffer;
        }
        
        // Fallback: re-fetch PDF data if not available
        if (this.fileId) {
            console.log('Re-fetching PDF data for worker processing');
            const response = await fetch(`/api/get-pdf/${this.fileId}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch PDF data: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            this.pdfArrayBuffer = arrayBuffer; // Store for future use
            return arrayBuffer;
        }
        
        throw new Error('PDF data not available for worker processing');
    }
    
    async generateThumbnailsMainThread() {
        console.log('=== THUMBNAIL DEBUG: Starting generation ===');
        console.log('Total pages:', this.totalPages);
        console.log('Document visibility state:', document.visibilityState);
        console.log('Document hidden:', document.hidden);
        
        // Show thumbnail loading state
        const loadingElement = document.getElementById('thumbnailsLoading');
        if (loadingElement) {
            loadingElement.style.display = 'flex';
        }
        
        // Store original title to restore later
        const originalTitle = document.title;
        
        // Track timing and browser throttling
        let lastProcessTime = performance.now();
        let throttleDetectionCount = 0;
        
        // Page Visibility API monitoring
        const handleVisibilityChange = () => {
            console.log('=== VISIBILITY CHANGE ===');
            console.log('New visibility state:', document.visibilityState);
            console.log('Document hidden:', document.hidden);
            console.log('Performance now:', performance.now());
        };
        
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        try {
            for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
                try {
                    const startTime = performance.now();
                    console.log(`=== Processing page ${pageNum}/${this.totalPages} at ${startTime.toFixed(2)}ms ===`);
                    
                    const page = await this.currentPDF.getPage(pageNum);
                    console.log(`Page ${pageNum} loaded in ${(performance.now() - startTime).toFixed(2)}ms`);
                    
                    // Calculate optimal scale for thumbnail generation
                    // Target thumbnail width for consistent display
                    const targetThumbnailWidth = 150;
                    const baseViewport = page.getViewport({ scale: 1 });
                    let scale = targetThumbnailWidth / baseViewport.width;
                    
                    // Adjust scale based on document size for performance
                    if (this.totalPages > 500) scale *= 0.6;      // Smaller for 500+ pages
                    else if (this.totalPages > 200) scale *= 0.8; // Slightly smaller for 200+ pages
                    
                    // Ensure minimum scale for readability and maximum for performance
                    scale = Math.max(0.15, Math.min(0.5, scale));
                    
                    const viewport = page.getViewport({ scale });
                    
                    // Create canvas sized to viewport (no extra space)
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    
                    // Set canvas to exact rendered size
                    canvas.width = Math.round(viewport.width);
                    canvas.height = Math.round(viewport.height);

                    const renderStartTime = performance.now();
                    // Render page to canvas with white background for clean edges
                    context.fillStyle = '#ffffff';
                    context.fillRect(0, 0, canvas.width, canvas.height);
                    
                    await page.render({
                        canvasContext: context,
                        viewport: viewport
                    }).promise;
                    console.log(`Page ${pageNum} rendered in ${(performance.now() - renderStartTime).toFixed(2)}ms`);

                    // Convert to base64
                    const thumbnailDataURL = canvas.toDataURL('image/png');
                    
                    this.thumbnails.push({
                        page: pageNum - 1,
                        buffer: thumbnailDataURL,
                        width: viewport.width,
                        height: viewport.height
                    });

                    // Update progress for user feedback
                    const thumbnailProgress = 50 + (pageNum / this.totalPages) * 50; // From 50% to 100%
                    this.updateProgress(thumbnailProgress, `Generating thumbnails... ${pageNum}/${this.totalPages}`);
                    
                    const endTime = performance.now();
                    const processingTime = endTime - startTime;
                    console.log(`Page ${pageNum} total processing time: ${processingTime.toFixed(2)}ms`);
                    
                    // Detect browser throttling
                    if (pageNum > 1) {
                        const timeSinceLastPage = startTime - lastProcessTime;
                        if (timeSinceLastPage > 1000) { // More than 1 second gap indicates potential throttling
                            throttleDetectionCount++;
                            console.warn(`=== POTENTIAL THROTTLING DETECTED ===`);
                            console.warn(`Gap since last page: ${timeSinceLastPage.toFixed(2)}ms`);
                            console.warn(`Throttle detection count: ${throttleDetectionCount}`);
                            console.warn(`Visibility state: ${document.visibilityState}`);
                        }
                    }
                    lastProcessTime = endTime;
                    
                    // Enhanced background processing with anti-throttling
                    if (pageNum % 3 === 0 || pageNum === this.totalPages) {
                        console.log(`Generated ${pageNum}/${this.totalPages} thumbnails`);
                        console.log(`Throttle detections so far: ${throttleDetectionCount}`);
                        
                        // Update document title to show progress (visible even when tab is inactive)
                        const progressPercent = Math.round(thumbnailProgress);
                        document.title = `PDF Composer - Loading ${progressPercent}%`;
                        
                        // Force immediate UI update
                        this.updateThumbnailUI();
                        
                        // Use enhanced yielding with anti-throttling
                        await this.yieldToMainThread();
                        
                        // Additional anti-throttling: tiny DOM manipulation
                        const progressEl = document.getElementById('progressText');
                        if (progressEl) {
                            progressEl.style.opacity = progressEl.style.opacity === '1' ? '0.999' : '1';
                        }
                        
                        console.log(`Yield complete for batch ending at page ${pageNum}`);
                    }
                    
                    // Clean up page
                    page.cleanup();
                    
                } catch (pageError) {
                    console.error(`Error generating thumbnail for page ${pageNum}:`, pageError);
                    // Add placeholder thumbnail for failed page
                    this.thumbnails.push({
                        page: pageNum - 1,
                        buffer: null,
                        width: 200,
                        height: 300
                    });
                    // Continue with next page
                }
            }
            
            console.log('=== THUMBNAIL DEBUG: Generation complete ===');
            console.log(`Total throttle detections: ${throttleDetectionCount}`);
            console.log(`Final visibility state: ${document.visibilityState}`);
            
            // Complete processing
            this.onThumbnailGenerationComplete();
            
        } catch (error) {
            console.error('Error generating thumbnails:', error);
            this.onThumbnailGenerationError(error);
        } finally {
            // Remove visibility listener
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            // Restore original title
            document.title = originalTitle;
        }
    }
    
    async yieldToMainThread() {
        // Simple immediate return without yielding - prevent browser throttling
        return Promise.resolve();
    }

    // renderCurrentPage removed - using preview only

    renderThumbnails() {
        const container = document.getElementById('thumbnailsContainer');
        container.innerHTML = '';

        for (let i = 0; i < this.totalPages; i++) {
            const thumbnailElement = this.createThumbnailElement(i);
            container.appendChild(thumbnailElement);
        }

        document.getElementById('pageCount').textContent = this.totalPages;
    }
    
    updateThumbnailUI() {
        // Update thumbnail images that have been loaded without regenerating entire UI
        const container = document.getElementById('thumbnailsContainer');
        if (!container) return;
        
        for (let i = 0; i < this.totalPages; i++) {
            const thumbnailElement = container.querySelector(`[data-page="${i}"]`);
            if (thumbnailElement) {
                const imageContainer = thumbnailElement.querySelector('.thumbnail-image');
                if (imageContainer) {
                    imageContainer.innerHTML = this.getThumbnailImageHTML(i);
                }
            }
        }
    }

    createThumbnailElement(pageIndex) {
        const div = document.createElement('div');
        div.className = 'thumbnail-item';
        div.dataset.page = pageIndex;

        div.innerHTML = `
            <div class="thumbnail-content">
                <div class="thumbnail-image">
                    ${this.getThumbnailImageHTML(pageIndex)}
                </div>
                <div class="thumbnail-info">
                    <span class="page-number">${pageIndex + 1}</span>
                    <div class="selection-indicators">
                        ${this.getSelectionBadges(pageIndex)}
                    </div>
                </div>
                <div class="selection-controls">
                    <button class="selection-btn citation-btn" data-page="${pageIndex}" title="Select for Citation">
                        ${this.selectedCitations.has(pageIndex) ? '✓' : '○'}
                    </button>
                    <button class="selection-btn cover-btn" data-page="${pageIndex}" title="Select as Cover">
                        ${this.selectedCover === pageIndex ? '★' : '☆'}
                    </button>
                </div>
            </div>
        `;

        // Add event listeners
        div.addEventListener('click', (e) => {
            if (!e.target.classList.contains('selection-btn')) {
                this.showPagePreview(pageIndex);
            }
        });

        // Citation button
        const citationBtn = div.querySelector('.citation-btn');
        citationBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleCitationSelection(pageIndex);
        });

        // Cover button
        const coverBtn = div.querySelector('.cover-btn');
        coverBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleCoverSelection(pageIndex);
        });

        this.updateThumbnailClasses(div, pageIndex);
        
        return div;
    }

    getThumbnailImageHTML(pageIndex) {
        const thumbnail = this.thumbnails[pageIndex];
        if (thumbnail && thumbnail.buffer) {
            // Check if buffer is already a data URL or base64
            const src = thumbnail.buffer.startsWith('data:') 
                ? thumbnail.buffer 
                : `data:image/png;base64,${thumbnail.buffer}`;
            return `<img src="${src}" alt="Page ${pageIndex + 1}">`;
        }
        return `<div class="thumbnail-loading">Loading...</div>`;
    }

    getSelectionBadges(pageIndex) {
        let badges = '';
        if (this.selectedCitations.has(pageIndex)) {
            badges += '<span class="selection-badge badge-citation">CIT</span>';
        }
        if (this.selectedCover === pageIndex) {
            badges += '<span class="selection-badge badge-cover">CVR</span>';
        }
        return badges;
    }

    updateThumbnailClasses(element, pageIndex) {
        element.classList.remove('selected-citation', 'selected-cover', 'selected-both');
        
        const isCitation = this.selectedCitations.has(pageIndex);
        const isCover = this.selectedCover === pageIndex;
        
        // Removed excessive logging for performance
        
        if (isCitation && isCover) {
            element.classList.add('selected-both');
        } else if (isCitation) {
            element.classList.add('selected-citation');
        } else if (isCover) {
            element.classList.add('selected-cover');
        }
    }

    toggleCitationSelection(pageIndex) {
        console.log('=== TOGGLING CITATION SELECTION ===');
        console.log('Page index:', pageIndex);
        console.log('Currently selected citations:', Array.from(this.selectedCitations));
        
        if (this.selectedCitations.has(pageIndex)) {
            this.selectedCitations.delete(pageIndex);
            console.log('Removed citation:', pageIndex);
        } else {
            this.selectedCitations.add(pageIndex);
            console.log('Added citation:', pageIndex);
        }
        
        console.log('New citations selection:', Array.from(this.selectedCitations));
        console.log('Cover selected:', this.selectedCover);
        
        this.updateThumbnailElement(pageIndex);
        this.updateSelectionSummary();
        this.updatePreviewStatus();
        this.updatePreviewVisibility();
        
        console.log('=== CITATION SELECTION COMPLETE ===');
    }

    toggleCoverSelection(pageIndex) {
        console.log('=== TOGGLING COVER SELECTION ===');
        console.log('Page index:', pageIndex);
        console.log('Current cover:', this.selectedCover);
        
        const oldCover = this.selectedCover; // Store old cover before changing
        
        if (this.selectedCover === pageIndex) {
            this.selectedCover = null;
            console.log('Removed cover selection');
        } else {
            this.selectedCover = pageIndex;
            console.log('Set cover to:', pageIndex);
        }
        
        console.log('Citations selected:', Array.from(this.selectedCitations));
        console.log('Cover selected:', this.selectedCover);
        
        // Update only affected thumbnails for performance
        if (oldCover !== null) {
            this.updateThumbnailElement(oldCover); // Update old cover
        }
        if (this.selectedCover !== null) {
            this.updateThumbnailElement(this.selectedCover); // Update new cover
        }
        this.updateSelectionSummary();
        this.updatePreviewStatus();
        this.updatePreviewVisibility();
        
        console.log('=== COVER SELECTION COMPLETE ===');
    }

    updateThumbnailElement(pageIndex) {
        const element = document.querySelector(`[data-page="${pageIndex}"]`);
        if (element) {
            // Update button states
            const citationBtn = element.querySelector('.citation-btn');
            const coverBtn = element.querySelector('.cover-btn');
            
            citationBtn.textContent = this.selectedCitations.has(pageIndex) ? '✓' : '○';
            citationBtn.classList.toggle('active-citation', this.selectedCitations.has(pageIndex));
            
            coverBtn.textContent = this.selectedCover === pageIndex ? '★' : '☆';
            coverBtn.classList.toggle('active-cover', this.selectedCover === pageIndex);
            
            // Update badges
            const badgesContainer = element.querySelector('.selection-indicators');
            badgesContainer.innerHTML = this.getSelectionBadges(pageIndex);
            
            // Update classes
            this.updateThumbnailClasses(element, pageIndex);
        }
    }


    goToPage(pageIndex) {
        if (pageIndex >= 0 && pageIndex < this.totalPages) {
            this.currentPage = pageIndex;
            this.renderCurrentPage();
        }
    }

    previousPage() {
        if (this.currentPage > 0) {
            this.goToPage(this.currentPage - 1);
        }
    }

    nextPage() {
        if (this.currentPage < this.totalPages - 1) {
            this.goToPage(this.currentPage + 1);
        }
    }

    updatePageDisplay() {
        // Page display removed - using preview only
    }


    async composePDF() {
        if (this.selectedCitations.size === 0) {
            this.showToast('Please select at least one citation page', 'error');
            return;
        }

        const composeBtn = document.getElementById('composeBtn');
        const originalText = composeBtn.textContent;
        composeBtn.textContent = 'COMPOSING...';
        composeBtn.disabled = true;

        try {
            const selectedPages = Array.from(this.selectedCitations);
            const coverPlacement = document.getElementById('coverPlacement')?.value || 'top';
            const exportFormat = document.getElementById('exportFormat')?.value || 'pdf';

            const response = await fetch('/api/compose', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fileId: this.fileId,
                    selectedPages: selectedPages,
                    coverPage: this.selectedCover,
                    coverPlacement: coverPlacement,
                    exportFormat: exportFormat
                })
            });

            if (!response.ok) {
                throw new Error(`Composition failed: ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.success) {
                this.showToast('PDF composed successfully! Download starting...', 'success');
                
                // Trigger download
                const link = document.createElement('a');
                link.href = result.downloadUrl;
                link.download = result.filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                this.closeSelectionPanel();
            } else {
                throw new Error(result.error || 'Composition failed');
            }
            
        } catch (error) {
            console.error('Composition error:', error);
            this.showToast('Failed to compose PDF: ' + error.message, 'error');
        } finally {
            composeBtn.textContent = originalText;
            composeBtn.disabled = this.selectedCitations.size === 0;
        }
    }

    togglePreview() {
        const previewPanel = document.getElementById('previewPanel');
        const toggleBtn = document.getElementById('togglePreview');
        
        if (previewPanel.classList.contains('hidden')) {
            this.showPreview();
            toggleBtn.textContent = '▼';
            toggleBtn.setAttribute('title', 'Hide Preview');
        } else {
            this.hidePreview();
            toggleBtn.textContent = '▶';
            toggleBtn.setAttribute('title', 'Show Preview');
        }
    }

    showPreview() {
        const previewPanel = document.getElementById('previewPanel');
        previewPanel.classList.remove('hidden');
        
        // Update preview status
        this.updatePreviewStatus();
        
        if (this.selectedCitations.size > 0) {
            this.generateCompositionPreview();
        } else {
            this.showPreviewEmptyState();
        }
    }
    
    updatePreviewStatus() {
        const statusText = document.getElementById('previewStatus')?.querySelector('.status-text');
        if (!statusText) return;
        
        if (this.selectedCitations.size === 0) {
            statusText.textContent = 'Select citations to preview';
        } else if (this.selectedCitations.size === 1) {
            statusText.textContent = '1 citation selected';
        } else {
            statusText.textContent = `${this.selectedCitations.size} citations selected`;
        }
    }
    
    showPreviewEmptyState() {
        const previewEmptyState = document.getElementById('previewEmptyState');
        const previewViewport = document.getElementById('previewViewport');
        const batchPreviewContainer = document.getElementById('batchPreviewContainer');
        const controlsPanel = document.getElementById('controlsPanel');
        
        if (previewEmptyState) previewEmptyState.style.display = 'flex';
        if (previewViewport) previewViewport.style.display = 'none';
        if (batchPreviewContainer) batchPreviewContainer.style.display = 'none';
        if (controlsPanel) controlsPanel.style.display = 'none';
    }
    
    hidePreviewEmptyState() {
        const previewEmptyState = document.getElementById('previewEmptyState');
        if (previewEmptyState) previewEmptyState.style.display = 'none';
    }

    hidePreview() {
        const previewPanel = document.getElementById('previewPanel');
        previewPanel.classList.add('hidden');
    }

    async generateCompositionPreview() {
        console.log('generateCompositionPreview called - Mode:', this.overlayMode, 'Citations:', this.selectedCitations.size, 'Cover:', this.selectedCover);
        
        if (!this.currentPDF || this.selectedCitations.size === 0) {
            this.showPreviewEmptyState();
            return;
        }

        // Hide empty state and show preview content
        this.hidePreviewEmptyState();
        this.updatePreviewStatus();
        
        // Show appropriate preview mode
        if (this.overlayMode === 'sidebyside') {
            console.log('Generating batch preview for side-by-side mode');
            this.generateBatchPreview();
            return;
        }
        
        console.log('Generating overlay preview for custom mode');
        
        // Show single preview viewport and controls
        const previewViewport = document.getElementById('previewViewport');
        const batchPreviewContainer = document.getElementById('batchPreviewContainer');
        const controlsPanel = document.getElementById('controlsPanel');
        
        // Ensure proper display for overlay mode
        if (previewViewport) previewViewport.style.display = 'flex';
        if (batchPreviewContainer) batchPreviewContainer.style.display = 'none';
        if (controlsPanel) controlsPanel.style.display = 'block';

        const previewCanvas = document.getElementById('previewCanvas');
        const placeholder = previewCanvas?.parentElement?.querySelector('.preview-placeholder');
        const context = previewCanvas.getContext('2d');

        try {
            // Hide placeholder and show canvas
            if (placeholder) placeholder.style.display = 'none';
            previewCanvas.style.display = 'block';

            // Calculate composition layout - fit to container
            const container = previewCanvas.parentElement;
            const containerWidth = container.clientWidth - 24; // Account for margin
            const containerHeight = container.clientHeight - 24;
            
            const pageWidth = Math.min(containerWidth, 600); // Max 600px width
            const pageHeight = Math.min(containerHeight, pageWidth * 1.4); // A4-like ratio
            const margin = 20;
            const contentWidth = pageWidth - (2 * margin);
            
            // Calculate how many citation pages can fit per row
            const citationPages = Array.from(this.selectedCitations).sort((a, b) => a - b);
            const pagesPerRow = Math.min(2, citationPages.length);
            const citationWidth = contentWidth / pagesPerRow;
            const citationHeight = citationWidth * 1.4; // Maintain aspect ratio
            
            // Set canvas size
            previewCanvas.width = pageWidth;
            previewCanvas.height = pageHeight;
            
            // Clear canvas
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
            
            let currentY = margin;
            
            // Render citation pages first (as background)
            const citationRows = Math.ceil(citationPages.length / pagesPerRow);
            for (let i = 0; i < citationPages.length; i++) {
                const row = Math.floor(i / pagesPerRow);
                const col = i % pagesPerRow;
                
                const x = margin + (col * citationWidth);
                const y = currentY + (row * (citationHeight + margin));
                
                await this.renderPageToCanvas(context, citationPages[i], 
                    x, y, citationWidth, citationHeight);
            }
            
            // Setup interactive cover if selected (with small delay to ensure DOM is ready)
            if (this.selectedCover !== null) {
                console.log('Setting up interactive cover for overlay mode');
                setTimeout(async () => {
                    try {
                        await this.setupInteractiveCover();
                        console.log('Interactive cover setup completed');
                    } catch (error) {
                        console.error('Failed to setup interactive cover:', error);
                    }
                }, 100);
            }
            
            // Enable export button if we have citations (cover is optional for export)
            const exportBtn = document.getElementById('exportPreviewBtn');
            if (exportBtn) {
                exportBtn.disabled = !(this.selectedCitations.size > 0);
            }
            
        } catch (error) {
            console.error('Preview generation error:', error);
            if (placeholder) placeholder.style.display = 'block';
            if (previewCanvas) previewCanvas.style.display = 'none';
        }
    }

    async renderPageToCanvas(context, pageIndex, x, y, width, height) {
        if (!this.currentPDF) return;

        try {
            const page = await this.currentPDF.getPage(pageIndex + 1);
            const viewport = page.getViewport({ scale: 1 });
            
            // Calculate scale to fit target dimensions
            const scaleX = width / viewport.width;
            const scaleY = height / viewport.height;
            const scale = Math.min(scaleX, scaleY);
            
            const scaledViewport = page.getViewport({ scale });
            
            // Create temporary canvas for this page
            const tempCanvas = document.createElement('canvas');
            const tempContext = tempCanvas.getContext('2d');
            tempCanvas.width = scaledViewport.width;
            tempCanvas.height = scaledViewport.height;
            
            // Render page to temporary canvas
            await page.render({
                canvasContext: tempContext,
                viewport: scaledViewport
            }).promise;
            
            // Draw temporary canvas to main canvas at specified position
            const finalWidth = Math.min(width, scaledViewport.width);
            const finalHeight = Math.min(height, scaledViewport.height);
            const offsetX = x + (width - finalWidth) / 2;
            const offsetY = y + (height - finalHeight) / 2;
            
            context.drawImage(tempCanvas, 0, 0, scaledViewport.width, scaledViewport.height,
                             offsetX, offsetY, finalWidth, finalHeight);
            
        } catch (error) {
            console.error('Error rendering page to canvas:', error);
            // Draw placeholder rectangle
            context.fillStyle = '#f0f0f0';
            context.fillRect(x, y, width, height);
            context.strokeStyle = '#ccc';
            context.strokeRect(x, y, width, height);
            context.fillStyle = '#666';
            context.font = '16px Arial';
            context.textAlign = 'center';
            context.fillText(`Page ${pageIndex + 1}`, x + width/2, y + height/2);
        }
    }

    async generateBatchPreview() {
        if (!this.currentPDF || this.selectedCitations.size === 0) {
            this.showPreviewEmptyState();
            return;
        }

        const batchPreviewContainer = document.getElementById('batchPreviewContainer');
        const batchPreviewList = document.getElementById('batchPreviewList');
        const previewViewport = document.getElementById('previewViewport');
        const controlsPanel = document.getElementById('controlsPanel');

        // Show batch preview container and hide single preview
        if (batchPreviewContainer) batchPreviewContainer.style.display = 'block';
        if (previewViewport) previewViewport.style.display = 'none';
        if (controlsPanel) controlsPanel.style.display = 'none';

        if (!batchPreviewList) return;

        // Clear existing previews
        batchPreviewList.innerHTML = '';

        // Get selected citation pages
        const citationPages = Array.from(this.selectedCitations).sort((a, b) => a - b);

        try {
            // Create preview items for each citation
            for (const pageIndex of citationPages) {
                const previewItem = await this.createBatchPreviewItem(pageIndex);
                batchPreviewList.appendChild(previewItem);
            }

            // Add cover preview if selected
            if (this.selectedCover !== null) {
                const coverPreviewItem = await this.createBatchPreviewItem(this.selectedCover, true);
                batchPreviewList.appendChild(coverPreviewItem);
            }

        } catch (error) {
            console.error('Error generating batch preview:', error);
            this.showToast('Failed to generate preview', 'error');
        }
    }

    async createBatchPreviewItem(pageIndex, isCover = false) {
        const item = document.createElement('div');
        item.className = `batch-preview-item ${isCover ? 'cover-item' : 'citation-item'}`;
        
        // Create canvas for this preview
        const canvas = document.createElement('canvas');
        canvas.className = 'batch-preview-canvas';
        const context = canvas.getContext('2d');

        // Set canvas size (thumbnail size)
        const previewWidth = 200;
        const previewHeight = Math.round(previewWidth * 1.4); // A4 ratio
        canvas.width = previewWidth;
        canvas.height = previewHeight;

        // Create header
        const header = document.createElement('div');
        header.className = 'batch-preview-header';
        header.innerHTML = `
            <span class="preview-type">${isCover ? '★ COVER' : '○ CITATION'}</span>
            <span class="preview-page">Page ${pageIndex + 1}</span>
        `;

        // Render page to canvas
        try {
            await this.renderPageToCanvas(context, pageIndex, 0, 0, previewWidth, previewHeight);
        } catch (error) {
            console.error('Error rendering batch preview item:', error);
            // Draw placeholder
            context.fillStyle = '#f0f0f0';
            context.fillRect(0, 0, previewWidth, previewHeight);
            context.fillStyle = '#666';
            context.font = '14px Arial';
            context.textAlign = 'center';
            context.fillText(`Page ${pageIndex + 1}`, previewWidth / 2, previewHeight / 2);
        }

        item.appendChild(header);
        item.appendChild(canvas);

        return item;
    }

    async exportComposition() {
        console.log('=== EXPORT COMPOSITION STARTED ===');
        console.log('Current state:', {
            hasPDF: !!this.currentPDF,
            citationsCount: this.selectedCitations.size,
            coverSelected: this.selectedCover,
            selectedCitations: Array.from(this.selectedCitations)
        });
        
        const format = document.getElementById('previewExportFormat').value;
        const exportBtn = document.getElementById('exportPreviewBtn');
        const originalText = exportBtn.textContent;
        
        // Check preview panel state before export
        const previewPanel = document.getElementById('previewPanel');
        const previewCanvas = document.getElementById('previewCanvas');
        const wasPreviewVisible = !previewPanel.classList.contains('hidden');
        console.log('=== PREVIEW STATE BEFORE EXPORT ===');
        console.log('Preview panel visible:', wasPreviewVisible);
        console.log('Preview panel classes:', previewPanel ? previewPanel.className : 'panel not found');
        console.log('Preview canvas exists:', !!previewCanvas);
        console.log('Preview canvas dimensions:', previewCanvas ? previewCanvas.width + 'x' + previewCanvas.height : 'canvas not found');
        console.log('Preview canvas style display:', previewCanvas ? previewCanvas.style.display : 'N/A');
        
        exportBtn.textContent = 'EXPORTING...';
        exportBtn.disabled = true;
        
        // Export in progress - but don't set flag that interferes with preview
        console.log('Starting export process...');
        
        try {
            // Validate state before export
            if (!this.currentPDF) {
                throw new Error('No PDF loaded');
            }
            
            if (this.selectedCitations.size === 0) {
                throw new Error('No citation pages selected');
            }
            
            if (this.selectedCover === null) {
                throw new Error('No cover page selected');
            }
            
            // Use simpler export method
            await this.exportCurrentComposition(format);
            
            this.showToast(`Composition exported as ${format.toUpperCase()}`, 'success');
            
        } catch (error) {
            console.error('Export error:', error);
            this.showToast('Export failed: ' + error.message, 'error');
        } finally {
            exportBtn.textContent = originalText;
            exportBtn.disabled = false;
            
            // Export complete
            console.log('Export process finished');
            
            // Check preview state after export
            console.log('=== PREVIEW STATE AFTER EXPORT ===');
            const previewPanelAfter = document.getElementById('previewPanel');
            const previewCanvasAfter = document.getElementById('previewCanvas');
            console.log('Preview panel visible after:', !previewPanelAfter.classList.contains('hidden'));
            console.log('Preview panel classes after:', previewPanelAfter.className);
            console.log('Preview canvas display after:', previewCanvasAfter ? previewCanvasAfter.style.display : 'N/A');
            
            // Ensure preview remains visible after export
            this.ensurePreviewVisible();
        }
    }

    async exportCurrentComposition(format) {
        console.log('Exporting current composition in format:', format);
        
        if (!this.currentPDF || this.selectedCitations.size === 0 || this.selectedCover === null) {
            throw new Error('Missing PDF, citations, or cover selection');
        }

        try {
            console.log('=== CALLING CREATE EXPORT CANVAS ===');
            // Create a composite canvas that includes both background and cover
            // Use different scales for different formats - enhanced for maximum quality
            let scale = 3; // Default high scale
            if (format === 'png') scale = 4; // Maximum quality for PNG
            if (format === 'jpeg') scale = 3; // High quality for JPEG  
            if (format === 'pdf') scale = 4; // Maximum quality for PDF
            
            const exportCanvas = await this.createExportCanvas(scale);
            console.log('=== EXPORT CANVAS CREATED SUCCESSFULLY ===');
            console.log('Created export canvas with dimensions:', exportCanvas.width, 'x', exportCanvas.height);
            console.log('Export format requested:', format);
            
            if (exportCanvas.width === 0 || exportCanvas.height === 0) {
                throw new Error('Export canvas is empty - please ensure composition is rendered first');
            }

            if (format === 'png') {
                // Export as PNG - wrap in promise to make it awaitable
                await new Promise((resolve, reject) => {
                    exportCanvas.toBlob((blob) => {
                        if (blob) {
                            this.downloadFile(blob, 'composition.png', 'image/png');
                            resolve();
                        } else {
                            reject(new Error('Failed to create PNG blob'));
                        }
                    }, 'image/png', 0.95);
                });
            } else if (format === 'jpeg') {
                // Export as JPEG - wrap in promise to make it awaitable
                await new Promise((resolve, reject) => {
                    exportCanvas.toBlob((blob) => {
                        if (blob) {
                            this.downloadFile(blob, 'composition.jpg', 'image/jpeg');
                            resolve();
                        } else {
                            reject(new Error('Failed to create JPEG blob'));
                        }
                    }, 'image/jpeg', 0.95);
                });
            } else if (format === 'pdf') {
                // Export as PDF using export canvas
                const imageData = exportCanvas.toDataURL('image/png');
                if (!imageData || imageData === 'data:,') {
                    throw new Error('Failed to get preview canvas image data');
                }
                await this.exportCanvasToPDF(exportCanvas, imageData);
            }

            console.log('Export completed successfully');

        } catch (error) {
            console.error('Export error:', error);
            throw error;
        }
    }

    async exportCanvasToPDF(canvas, imageData) {
        try {
            // Check if PDF-lib is available
            if (typeof PDFLib === 'undefined') {
                throw new Error('PDF-lib library not available');
            }

            console.log('Creating PDF document...');
            
            // Create PDF document
            const pdfDoc = await PDFLib.PDFDocument.create();
            const page = pdfDoc.addPage([canvas.width, canvas.height]);
            
            // Convert data URL to bytes
            const imageBytes = this.dataURLToBytes(imageData);
            
            // Embed PNG image
            const image = await pdfDoc.embedPng(imageBytes);
            
            // Draw image
            page.drawImage(image, {
                x: 0,
                y: 0,
                width: canvas.width,
                height: canvas.height,
            });
            
            // Save and download
            const pdfBytes = await pdfDoc.save();
            this.downloadFile(pdfBytes, 'composition.pdf', 'application/pdf');
            
            console.log('PDF export completed');
            
        } catch (error) {
            console.error('PDF export error:', error);
            throw new Error('PDF export failed: ' + error.message);
        }
    }

    downloadFile(data, filename, mimeType) {
        console.log('Downloading file:', filename, 'Type:', mimeType);
        console.log('Data type:', data instanceof Blob ? 'Blob' : typeof data);
        console.log('Data size:', data instanceof Blob ? data.size : data.length);
        
        const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
        console.log('Blob created, size:', blob.size);
        
        const url = URL.createObjectURL(blob);
        console.log('Object URL created:', url);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        
        console.log('Triggering download click...');
        link.click();
        
        document.body.removeChild(link);
        console.log('Download triggered successfully');
        
        // Clean up
        setTimeout(() => {
            URL.revokeObjectURL(url);
            console.log('Object URL cleaned up');
        }, 1000);
    }

    dataURLToBytes(dataURL) {
        const base64 = dataURL.split(',')[1];
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    async exportWithCustomCoverPosition(format) {
        if (!this.currentPDF || this.selectedCitations.size === 0) {
            throw new Error('No PDF loaded or no citations selected');
        }

        // Check if we have both citation and cover selected for composition
        const hasComposition = this.selectedCitations.size > 0 && this.selectedCover !== null;
        
        if (!hasComposition) {
            throw new Error('Please select both citation pages and a cover page for export');
        }

        console.log('Exporting with custom cover position:', this.coverTransform);
        
        try {
            if (format === 'pdf') {
                await this.exportCompositionToPDF();
            } else if (format === 'png') {
                await this.exportCompositionToPNG();
            } else if (format === 'jpeg') {
                await this.exportCompositionToJPEG();
            } else {
                throw new Error('Unsupported format: ' + format);
            }
        } catch (error) {
            throw new Error(`Export failed: ${error.message}`);
        }
    }

    async exportCompositionToPDF() {
        if (typeof PDFLib === 'undefined') {
            throw new Error('PDF-lib library not loaded');
        }

        // Create high-resolution canvas for the composition
        const exportCanvas = await this.createCompositionCanvas(2); // 2x scale for PDF
        
        // Convert canvas to image data
        const imageData = exportCanvas.toDataURL('image/png');
        const imageBytes = this.dataURLToBytes(imageData);
        
        // Create PDF document
        const pdfDoc = await PDFLib.PDFDocument.create();
        const page = pdfDoc.addPage([exportCanvas.width / 2, exportCanvas.height / 2]);
        
        // Embed image
        const image = await pdfDoc.embedPng(imageBytes);
        
        // Draw image to fill the page
        page.drawImage(image, {
            x: 0,
            y: 0,
            width: page.getWidth(),
            height: page.getHeight(),
        });
        
        // Save and download
        const pdfBytes = await pdfDoc.save();
        this.downloadFile(pdfBytes, 'composition.pdf', 'application/pdf');
    }

    async exportCompositionToPNG() {
        // Create high-resolution canvas for PNG (3x scale for better quality)
        const exportCanvas = await this.createCompositionCanvas(3);
        
        // Convert to blob and download
        exportCanvas.toBlob((blob) => {
            this.downloadFile(blob, 'composition.png', 'image/png');
        }, 'image/png', 0.95);
    }

    async exportCompositionToJPEG() {
        // Create high-resolution canvas for JPEG (2x scale)
        const exportCanvas = await this.createCompositionCanvas(2);
        
        // Convert to blob and download
        exportCanvas.toBlob((blob) => {
            this.downloadFile(blob, 'composition.jpg', 'image/jpeg');
        }, 'image/jpeg', 0.9);
    }

    async createCompositionCanvas(scaleFactor = 2) {
        if (!this.currentPDF || this.selectedCitations.size === 0 || this.selectedCover === null) {
            throw new Error('Invalid composition state');
        }

        // Get the preview canvas dimensions as base
        const previewCanvas = document.getElementById('previewCanvas');
        const baseWidth = previewCanvas.width;
        const baseHeight = previewCanvas.height;
        
        // Create high-resolution export canvas
        const exportCanvas = document.createElement('canvas');
        const context = exportCanvas.getContext('2d');
        
        exportCanvas.width = baseWidth * scaleFactor;
        exportCanvas.height = baseHeight * scaleFactor;
        
        // Scale the drawing context
        context.scale(scaleFactor, scaleFactor);
        
        // Render the composition with citation as background and cover overlay
        await this.renderCompositionWithCustomCover(context, baseWidth, baseHeight);
        
        return exportCanvas;
    }

    async renderCompositionWithCustomCover(context, canvasWidth, canvasHeight) {
        console.log('Rendering composition with custom cover positioning');
        
        // Clear canvas with white background
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvasWidth, canvasHeight);
        
        // Get the first selected citation page to use as background
        const citationPages = Array.from(this.selectedCitations).sort((a, b) => a - b);
        const backgroundPageIndex = citationPages[0];
        
        console.log('Using citation page', backgroundPageIndex, 'as background');
        
        // Render citation page as background at full canvas size
        await this.renderPageAsBackground(context, backgroundPageIndex, canvasWidth, canvasHeight);
        
        // Calculate cover dimensions and position based on user's transform
        const coverDimensions = this.calculateCoverDimensions(canvasWidth, canvasHeight);
        
        console.log('Cover dimensions calculated:', coverDimensions);
        
        // Render cover overlay at the exact user position
        await this.renderCoverOverlay(context, coverDimensions);
        
        console.log('Composition rendering complete');
    }

    async renderPageAsBackground(context, pageIndex, canvasWidth, canvasHeight) {
        try {
            const page = await this.currentPDF.getPage(pageIndex + 1);
            const viewport = page.getViewport({ scale: 1 });
            
            // Calculate scale to fill the canvas while maintaining aspect ratio
            const scaleX = canvasWidth / viewport.width;
            const scaleY = canvasHeight / viewport.height;
            const scale = Math.max(scaleX, scaleY); // Use max to fill the canvas
            
            const scaledViewport = page.getViewport({ scale });
            
            // Create temporary canvas for the page
            const tempCanvas = document.createElement('canvas');
            const tempContext = tempCanvas.getContext('2d');
            tempCanvas.width = scaledViewport.width;
            tempCanvas.height = scaledViewport.height;
            
            // Render page to temporary canvas
            await page.render({
                canvasContext: tempContext,
                viewport: scaledViewport
            }).promise;
            
            // Calculate centering offsets
            const offsetX = (canvasWidth - scaledViewport.width) / 2;
            const offsetY = (canvasHeight - scaledViewport.height) / 2;
            
            // Draw the citation page as background
            context.drawImage(tempCanvas, offsetX, offsetY);
            
            console.log('Citation page rendered as background');
            
        } catch (error) {
            console.error('Error rendering citation page as background:', error);
            throw error;
        }
    }

    calculateCoverDimensions(canvasWidth, canvasHeight) {
        console.log('=== CALCULATING COVER DIMENSIONS FOR EXPORT ===');
        console.log('Export canvas size:', canvasWidth, 'x', canvasHeight);
        console.log('Current cover transform:', this.coverTransform);
        
        // Get preview canvas dimensions directly instead of container
        const previewCanvas = document.getElementById('previewCanvas');
        if (!previewCanvas) {
            console.error('Preview canvas not found for dimension calculation');
            return null;
        }
        
        const previewWidth = previewCanvas.width;
        const previewHeight = previewCanvas.height;
        
        console.log('Preview canvas size:', previewWidth, 'x', previewHeight);
        
        // Calculate the ratio between export canvas and preview canvas
        const scaleRatioX = canvasWidth / previewWidth;
        const scaleRatioY = canvasHeight / previewHeight;
        
        // Use consistent scaling (usually they should be the same)
        const scaleRatio = Math.min(scaleRatioX, scaleRatioY);
        
        console.log('Scale ratios - X:', scaleRatioX, 'Y:', scaleRatioY, 'Final:', scaleRatio);
        
        // Convert from container coordinates to canvas-relative coordinates first
        // We need to get the container and canvas positioning to do this correctly
        let coverX, coverY, coverWidth, coverHeight;
        
        const previewCanvasContainer = document.querySelector('.preview-canvas-container');
        if (previewCanvasContainer) {
            const canvasRect = previewCanvas.getBoundingClientRect();
            const containerRect = previewCanvasContainer.getBoundingClientRect();
            
            // Calculate citation page bounds in container coordinates
            const citationLeft = canvasRect.left - containerRect.left;
            const citationTop = canvasRect.top - containerRect.top;
            
            // Convert cover position from container coordinates to citation page relative coordinates
            const citationRelativeX = this.coverTransform.x - citationLeft;
            const citationRelativeY = this.coverTransform.y - citationTop;
            
            // Convert to relative positioning within the canvas
            const relativeX = citationRelativeX / previewWidth;
            const relativeY = citationRelativeY / previewHeight;
            
            // Calculate export position based on relative positioning
            coverX = relativeX * canvasWidth;
            coverY = relativeY * canvasHeight;
            
            // Calculate cover dimensions - scale should be relative to export canvas size
            coverWidth = this.coverTransform.originalWidth * this.coverTransform.scale * scaleRatio;
            coverHeight = this.coverTransform.originalHeight * this.coverTransform.scale * scaleRatio;
            
            console.log('Cover coordinate conversion:', {
                containerCoords: { x: this.coverTransform.x, y: this.coverTransform.y },
                citationBounds: { left: citationLeft, top: citationTop },
                relativeCoords: { x: citationRelativeX, y: citationRelativeY },
                normalizedCoords: { x: relativeX, y: relativeY },
                exportCoords: { x: coverX, y: coverY }
            });
        } else {
            // Fallback if container not found - use direct scaling
            console.warn('Container not found, using direct coordinate scaling');
            coverWidth = this.coverTransform.originalWidth * this.coverTransform.scale * scaleRatio;
            coverHeight = this.coverTransform.originalHeight * this.coverTransform.scale * scaleRatio;
            coverX = this.coverTransform.x * scaleRatio;
            coverY = this.coverTransform.y * scaleRatio;
        }
        
        // Validate dimensions - if they're invalid, use fallback values
        if (coverWidth <= 0 || coverHeight <= 0 || this.coverTransform.originalWidth <= 0) {
            console.warn('Invalid cover dimensions detected, using fallback values');
            const fallbackWidth = canvasWidth * 0.25;
            const fallbackHeight = canvasHeight * 0.25;
            const fallbackX = canvasWidth - fallbackWidth - 20;
            const fallbackY = 20;
            
            const fallback = {
                x: fallbackX,
                y: fallbackY,
                width: fallbackWidth,
                height: fallbackHeight
            };
            
            console.log('Using fallback cover dimensions:', fallback);
            return fallback;
        }
        
        const result = {
            x: coverX,
            y: coverY,
            width: coverWidth,
            height: coverHeight
        };
        
        console.log('Calculated cover dimensions for export:', result);
        return result;
    }

    async renderCoverOverlay(context, coverDimensions) {
        console.log('=== RENDERING COVER OVERLAY FOR EXPORT ===');
        console.log('Cover dimensions:', coverDimensions);
        console.log('Selected cover page:', this.selectedCover);
        
        if (!coverDimensions) {
            console.error('No cover dimensions provided - skipping cover render');
            return;
        }
        
        try {
            const coverPage = await this.currentPDF.getPage(this.selectedCover + 1);
            const viewport = coverPage.getViewport({ scale: 1 });
            
            console.log('Cover page viewport:', viewport.width, 'x', viewport.height);
            
            // Calculate scale to match the cover dimensions
            const scaleX = coverDimensions.width / viewport.width;
            const scaleY = coverDimensions.height / viewport.height;
            const scale = Math.min(scaleX, scaleY);
            
            console.log('Cover scale calculation - X:', scaleX, 'Y:', scaleY, 'Final:', scale);
            
            const scaledViewport = coverPage.getViewport({ scale });
            console.log('Scaled cover viewport:', scaledViewport.width, 'x', scaledViewport.height);
            
            // Create temporary canvas for cover
            const coverCanvas = document.createElement('canvas');
            const coverContext = coverCanvas.getContext('2d');
            coverCanvas.width = scaledViewport.width;
            coverCanvas.height = scaledViewport.height;
            
            console.log('Rendering cover page to temp canvas...');
            
            // Render cover page
            await coverPage.render({
                canvasContext: coverContext,
                viewport: scaledViewport
            }).promise;
            
            console.log('Cover page rendered, applying to export canvas at:', coverDimensions.x, coverDimensions.y);
            
            // Add subtle shadow effect
            context.shadowColor = 'rgba(0, 0, 0, 0.3)';
            context.shadowBlur = 5;
            context.shadowOffsetX = 2;
            context.shadowOffsetY = 2;
            
            // Draw cover at the exact user position
            console.log('Drawing cover to export canvas with parameters:');
            console.log('Source:', 0, 0, scaledViewport.width, scaledViewport.height);
            console.log('Destination:', coverDimensions.x, coverDimensions.y, coverDimensions.width, coverDimensions.height);
            
            context.drawImage(
                coverCanvas, 
                0, 0, scaledViewport.width, scaledViewport.height,
                coverDimensions.x, coverDimensions.y, 
                coverDimensions.width, coverDimensions.height
            );
            
            // Reset shadow
            context.shadowColor = 'transparent';
            context.shadowBlur = 0;
            context.shadowOffsetX = 0;
            context.shadowOffsetY = 0;
            
            console.log('Cover overlay successfully rendered to export canvas!');
            
        } catch (error) {
            console.error('Error rendering cover overlay:', error);
            throw error;
        }
    }

    async exportToPDF() {
        if (typeof PDFLib === 'undefined') {
            throw new Error('PDF-lib library not loaded');
        }

        // Create high-resolution canvas (2x)
        const previewCanvas = document.getElementById('previewCanvas');
        const exportCanvas = document.createElement('canvas');
        const exportContext = exportCanvas.getContext('2d');
        
        const scale = 2; // 2x resolution for high quality
        exportCanvas.width = previewCanvas.width * scale;
        exportCanvas.height = previewCanvas.height * scale;
        
        // Scale the drawing context
        exportContext.scale(scale, scale);
        
        // Redraw the composition at high resolution
        await this.redrawCompositionToCanvas(exportContext, previewCanvas.width, previewCanvas.height);
        
        // Convert canvas to image data
        const imageData = exportCanvas.toDataURL('image/png');
        const imageBytes = this.dataURLToBytes(imageData);
        
        // Create PDF document
        const pdfDoc = await PDFLib.PDFDocument.create();
        const page = pdfDoc.addPage([exportCanvas.width / scale, exportCanvas.height / scale]);
        
        // Embed image
        const image = await pdfDoc.embedPng(imageBytes);
        
        // Draw image to fill the page
        page.drawImage(image, {
            x: 0,
            y: 0,
            width: page.getWidth(),
            height: page.getHeight(),
        });
        
        // Save and download
        const pdfBytes = await pdfDoc.save();
        this.downloadFile(pdfBytes, 'composition.pdf', 'application/pdf');
    }

    async exportToPNG() {
        // Create high-resolution canvas (3x for PNG)
        const previewCanvas = document.getElementById('previewCanvas');
        const exportCanvas = document.createElement('canvas');
        const exportContext = exportCanvas.getContext('2d');
        
        const scale = 3; // 3x resolution for high quality PNG
        exportCanvas.width = previewCanvas.width * scale;
        exportCanvas.height = previewCanvas.height * scale;
        
        // Scale the drawing context
        exportContext.scale(scale, scale);
        
        // Redraw the composition at high resolution
        await this.redrawCompositionToCanvas(exportContext, previewCanvas.width, previewCanvas.height);
        
        // Convert to blob and download
        exportCanvas.toBlob((blob) => {
            this.downloadFile(blob, 'composition.png', 'image/png');
        }, 'image/png', 0.95);
    }

    async exportToJPEG() {
        // Create high-resolution canvas (2x for JPEG)
        const previewCanvas = document.getElementById('previewCanvas');
        const exportCanvas = document.createElement('canvas');
        const exportContext = exportCanvas.getContext('2d');
        
        const scale = 2; // 2x resolution for JPEG
        exportCanvas.width = previewCanvas.width * scale;
        exportCanvas.height = previewCanvas.height * scale;
        
        // Scale the drawing context
        exportContext.scale(scale, scale);
        
        // Redraw the composition at high resolution
        await this.redrawCompositionToCanvas(exportContext, previewCanvas.width, previewCanvas.height);
        
        // Convert to blob and download
        exportCanvas.toBlob((blob) => {
            this.downloadFile(blob, 'composition.jpg', 'image/jpeg');
        }, 'image/jpeg', 0.9);
    }

    async redrawCompositionToCanvas(context, targetWidth, targetHeight) {
        if (!this.currentPDF || this.selectedCitations.size === 0) return;

        // Same layout calculation as preview
        const pageWidth = targetWidth;
        const pageHeight = targetHeight;
        const margin = 40;
        const contentWidth = pageWidth - (2 * margin);
        
        const citationPages = Array.from(this.selectedCitations).sort((a, b) => a - b);
        const pagesPerRow = Math.min(2, citationPages.length);
        const citationWidth = contentWidth / pagesPerRow;
        const citationHeight = citationWidth * 1.4;
        
        // Clear canvas
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, pageWidth, pageHeight);
        
        let currentY = margin;
        
        // Render cover if present and placement is top
        if (this.selectedCover !== null) {
            const coverPlacement = document.getElementById('coverPlacement').value;
            if (coverPlacement === 'top') {
                await this.renderPageToCanvas(context, this.selectedCover, 
                    margin, currentY, contentWidth, contentWidth * 1.4);
                currentY += contentWidth * 1.4 + margin;
            }
        }
        
        // Render citation pages
        const citationStartY = currentY;
        const citationRows = Math.ceil(citationPages.length / pagesPerRow);
        for (let i = 0; i < citationPages.length; i++) {
            const row = Math.floor(i / pagesPerRow);
            const col = i % pagesPerRow;
            
            const x = margin + (col * citationWidth);
            const y = currentY + (row * (citationHeight + margin));
            
            await this.renderPageToCanvas(context, citationPages[i], 
                x, y, citationWidth, citationHeight);
        }
        
        // Render cover if present and placement is center or bottom
        if (this.selectedCover !== null) {
            const coverPlacement = document.getElementById('coverPlacement').value;
            if (coverPlacement === 'center') {
                const centerY = citationStartY + (citationRows * (citationHeight + margin)) / 2;
                await this.renderPageToCanvas(context, this.selectedCover, 
                    margin, centerY, contentWidth, contentWidth * 1.4);
            } else if (coverPlacement === 'bottom') {
                const bottomY = citationStartY + citationRows * (citationHeight + margin);
                await this.renderPageToCanvas(context, this.selectedCover, 
                    margin, bottomY, contentWidth, contentWidth * 1.4);
            }
        }
    }

    dataURLToBytes(dataURL) {
        const base64 = dataURL.split(',')[1];
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        return bytes;
    }


    showEmptyState() {
        document.getElementById('emptyState').classList.remove('hidden');
        document.getElementById('pdfViewer').classList.add('hidden');
        document.getElementById('loadingState').classList.add('hidden');
        this.updateTechnicalInfo('PDF VIEWER IDLE // WAITING FOR INPUT');
        
        // Clear any running progress intervals
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    showLoadingState() {
        document.getElementById('emptyState').classList.add('hidden');
        document.getElementById('pdfViewer').classList.add('hidden');
        document.getElementById('loadingState').classList.remove('hidden');
        this.updateTechnicalInfo('LOADING PDF DOCUMENT...');
        
        // Initialize progress at 0%
        this.updateProgress(0, 'Preparing to load PDF...');
    }

    showPDFViewer() {
        document.getElementById('emptyState').classList.add('hidden');
        document.getElementById('loadingState').classList.add('hidden');
        document.getElementById('pdfViewer').classList.remove('hidden');
        
        // Ensure preview panel is visible
        const previewPanel = document.getElementById('previewPanel');
        if (previewPanel) {
            previewPanel.classList.remove('hidden');
        }
    }

    updateProgress(percentage, message = '') {
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const loadingCaption = document.querySelector('.loading-caption');
        
        if (progressFill && progressText) {
            const clampedProgress = Math.min(100, Math.max(0, percentage));
            progressFill.style.width = clampedProgress + '%';
            progressText.textContent = Math.round(clampedProgress) + '%';
        }
        
        if (loadingCaption && message) {
            loadingCaption.textContent = message.toUpperCase();
        }
        
        console.log(`Progress: ${Math.round(percentage)}% - ${message}`);
    }

    simulateProgress() {
        // This method is now deprecated - real progress tracking is used instead
        this.updateProgress(0, 'Starting PDF processing...');
    }

    completeProgress() {
        // Complete the progress and show final message
        this.updateProgress(100, 'PDF loaded successfully!');
    }

    async createExportCanvas(scale = 4) {
        try {
            console.log('=== CREATE EXPORT CANVAS CALLED ===');
            console.log('Creating export canvas with interactive cover at scale:', scale);
            
            // Get the current preview canvas as reference
            const previewCanvas = document.getElementById('previewCanvas');
            if (!previewCanvas || previewCanvas.width === 0 || previewCanvas.height === 0) {
                console.log('Preview canvas not ready, creating export canvas from composition');
                
                // Create a new canvas for export
                const exportCanvas = document.createElement('canvas');
                const canvasWidth = 800 * scale;  // Standard export width scaled
                const canvasHeight = 1000 * scale; // Standard export height scaled
                
                exportCanvas.width = canvasWidth;
                exportCanvas.height = canvasHeight;
                
                const context = exportCanvas.getContext('2d');
                context.scale(scale, scale);
                
                // Re-render the composition directly to export canvas
                await this.renderCompositionToCanvas(context, 800, 1000);
                
                return exportCanvas;
            } else {
                // Create high-resolution export canvas combining main canvas + interactive cover
                const exportCanvas = document.createElement('canvas');
                exportCanvas.width = previewCanvas.width * scale;
                exportCanvas.height = previewCanvas.height * scale;
                
                const exportContext = exportCanvas.getContext('2d');
                
                // Re-render citation page at high resolution instead of upscaling preview
                console.log('Re-rendering citation page at high resolution for export');
                
                // Get first citation page
                const citationPageIndex = Array.from(this.selectedCitations)[0];
                const citationPage = await this.currentPDF.getPage(citationPageIndex + 1);
                
                // Calculate high-resolution viewport for export
                const baseViewport = citationPage.getViewport({ scale: 1 });
                const exportScale = (previewCanvas.width * scale) / baseViewport.width;
                const highResViewport = citationPage.getViewport({ scale: exportScale });
                
                console.log('Export scale calculation:', {
                    previewWidth: previewCanvas.width,
                    scale: scale,
                    baseViewportWidth: baseViewport.width,
                    exportScale: exportScale,
                    highResWidth: highResViewport.width
                });
                
                // Render citation page directly to export canvas at high resolution
                await citationPage.render({
                    canvasContext: exportContext,
                    viewport: highResViewport
                }).promise;
                
                // Draw the interactive cover on top if it exists and is visible
                const coverContainer = document.getElementById('coverImageContainer');
                const coverCanvas = document.getElementById('coverCanvas');
                
                if (coverContainer && coverCanvas && !coverContainer.classList.contains('hidden')) {
                    console.log('Re-rendering cover at high resolution for export');
                    console.log('Cover position:', this.coverTransform.x, this.coverTransform.y, 'scale:', this.coverTransform.scale);
                    
                    // Convert from container coordinates to citation page relative coordinates for export
                    const previewCanvasContainer = document.querySelector('.preview-canvas-container');
                    const canvasRect = previewCanvas.getBoundingClientRect();
                    const containerRect = previewCanvasContainer.getBoundingClientRect();
                    
                    // Calculate citation page bounds in container coordinates (same as constraint logic)
                    const citationLeft = canvasRect.left - containerRect.left;
                    const citationTop = canvasRect.top - containerRect.top;
                    
                    // Convert cover position from container coordinates to citation page relative coordinates
                    const citationRelativeX = this.coverTransform.x - citationLeft;
                    const citationRelativeY = this.coverTransform.y - citationTop;
                    
                    // Re-render cover page at high resolution
                    const coverPage = await this.currentPDF.getPage(this.selectedCover + 1);
                    const coverBaseViewport = coverPage.getViewport({ scale: 1 });
                    
                    // Simple approach: scale everything by the export scale factor
                    const exportRelativeX = citationRelativeX * scale;
                    const exportRelativeY = citationRelativeY * scale;
                    
                    // Calculate cover scale for export - scale up by the same factor as the canvas
                    const previewCoverScale = this.coverTransform.scale;
                    const exportCoverScale = previewCoverScale * exportScale;
                    const highResCoverViewport = coverPage.getViewport({ scale: exportCoverScale });
                    
                    // Calculate final export dimensions from preview size
                    const previewCoverWidth = parseFloat(coverContainer.style.width) || coverContainer.offsetWidth;
                    const previewCoverHeight = parseFloat(coverContainer.style.height) || coverContainer.offsetHeight;
                    const exportCoverWidth = previewCoverWidth * scale;
                    const exportCoverHeight = previewCoverHeight * scale;
                    
                    console.log('High-res cover rendering:', {
                        previewCoverScale,
                        exportCoverScale,
                        previewSize: { width: previewCoverWidth, height: previewCoverHeight },
                        exportDimensions: { width: exportCoverWidth, height: exportCoverHeight },
                        citationBounds: { left: citationLeft, top: citationTop },
                        relativePosition: { x: citationRelativeX, y: citationRelativeY },
                        exportPosition: { x: exportRelativeX, y: exportRelativeY }
                    });
                    
                    // Create temporary high-resolution canvas for cover
                    const tempCoverCanvas = document.createElement('canvas');
                    tempCoverCanvas.width = highResCoverViewport.width;
                    tempCoverCanvas.height = highResCoverViewport.height;
                    const tempCoverContext = tempCoverCanvas.getContext('2d');
                    
                    // Render cover page to temporary canvas at high resolution
                    await coverPage.render({
                        canvasContext: tempCoverContext,
                        viewport: highResCoverViewport
                    }).promise;
                    
                    // Add shadow effect and draw the high-res cover
                    exportContext.save();
                    exportContext.shadowColor = 'rgba(0, 0, 0, 0.3)';
                    exportContext.shadowBlur = 8 * scale;
                    exportContext.shadowOffsetX = 4 * scale;
                    exportContext.shadowOffsetY = 4 * scale;
                    
                    exportContext.drawImage(
                        tempCoverCanvas,
                        exportRelativeX,
                        exportRelativeY,
                        exportCoverWidth,
                        exportCoverHeight
                    );
                    
                    exportContext.restore();
                    console.log('Cover successfully added to export with coordinate conversion');
                } else {
                    console.log('No interactive cover to add to export - coverContainer:', !!coverContainer, 'coverCanvas:', !!coverCanvas, 'hidden:', coverContainer?.classList.contains('hidden'));
                }
                
                return exportCanvas;
            }
        } catch (error) {
            console.error('Error creating export canvas:', error);
            return null;
        }
    }

    async renderCompositionToCanvas(context, canvasWidth, canvasHeight) {
        if (!this.currentPDF || this.selectedCitations.size === 0) return;

        // Clear canvas
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvasWidth, canvasHeight);

        // Render citations
        const citationPages = Array.from(this.selectedCitations).sort((a, b) => a - b);
        const cols = Math.ceil(Math.sqrt(citationPages.length));
        const rows = Math.ceil(citationPages.length / cols);
        
        const citationWidth = canvasWidth / cols;
        const citationHeight = canvasHeight / rows;

        for (let i = 0; i < citationPages.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = col * citationWidth;
            const y = row * citationHeight;
            
            await this.renderPageToCanvas(context, citationPages[i], x, y, citationWidth, citationHeight);
        }

        // Render cover if selected
        if (this.selectedCover !== null) {
            console.log('=== EXPORT DEBUG: Cover rendering start ===');
            console.log('Cover transform:', this.coverTransform);
            console.log('Export canvas dimensions:', canvasWidth, 'x', canvasHeight);
            
            const coverPage = await this.currentPDF.getPage(this.selectedCover + 1);
            const coverViewport = coverPage.getViewport({ scale: 1 });
            
            // Get the actual preview canvas and container for accurate measurements
            const previewCanvas = document.getElementById('previewCanvas');
            const previewContainer = previewCanvas?.parentElement;
            
            if (previewCanvas && previewContainer) {
                console.log('Using actual preview dimensions for export conversion');
                console.log('Preview canvas size:', previewCanvas.width, 'x', previewCanvas.height);
                console.log('Preview container size:', previewContainer.clientWidth, 'x', previewContainer.clientHeight);
                
                // Calculate export scaling factors
                const exportScaleX = canvasWidth / previewCanvas.width;
                const exportScaleY = canvasHeight / previewCanvas.height;
                console.log('Export scale factors:', exportScaleX, exportScaleY);
                
                // Convert cover position and size to export canvas
                const exportX = this.coverTransform.x * exportScaleX;
                const exportY = this.coverTransform.y * exportScaleY;
                const exportWidth = this.coverTransform.width * exportScaleX;
                const exportHeight = this.coverTransform.height * exportScaleY;
                
                console.log('Preview cover position:', this.coverTransform.x, this.coverTransform.y);
                console.log('Preview cover size:', this.coverTransform.width, this.coverTransform.height);
                console.log('Export cover position:', exportX, exportY);
                console.log('Export cover size:', exportWidth, exportHeight);
                
                // Create high-resolution cover canvas
                const tempCoverCanvas = document.createElement('canvas');
                tempCoverCanvas.width = exportWidth;
                tempCoverCanvas.height = exportHeight;
                const tempContext = tempCoverCanvas.getContext('2d');
                
                // Calculate scale for high-resolution rendering
                const highResScale = Math.max(exportWidth / coverViewport.width, exportHeight / coverViewport.height);
                const scaledCoverViewport = coverPage.getViewport({ scale: highResScale });
                
                console.log('High-res scale for cover:', highResScale);
                console.log('Scaled cover viewport:', scaledCoverViewport.width, 'x', scaledCoverViewport.height);
                
                // Render cover at high resolution
                tempCoverCanvas.width = scaledCoverViewport.width;
                tempCoverCanvas.height = scaledCoverViewport.height;
                await coverPage.render({
                    canvasContext: tempContext,
                    viewport: scaledCoverViewport
                }).promise;
                
                // Draw to export canvas with exact dimensions
                context.save();
                context.shadowColor = 'rgba(0, 0, 0, 0.3)';
                context.shadowBlur = 8 * (exportScaleX + exportScaleY) / 2; // Scale shadow with export
                context.shadowOffsetX = 4 * exportScaleX;
                context.shadowOffsetY = 4 * exportScaleY;
                
                context.drawImage(
                    tempCoverCanvas,
                    exportX,
                    exportY,
                    exportWidth,
                    exportHeight
                );
                
                context.restore();
                console.log('=== EXPORT DEBUG: Cover rendered successfully ===');
                
            } else {
                console.warn('Preview canvas not available, using fallback method');
                // Fallback method (existing code)
                const assumedContainerWidth = 800;
                const assumedContainerHeight = 600;
                
                const relativeX = this.coverTransform.x / assumedContainerWidth;
                const relativeY = this.coverTransform.y / assumedContainerHeight;
                
                const canvasX = relativeX * canvasWidth;
                const canvasY = relativeY * canvasHeight;
                
                const scaledCoverViewport = coverPage.getViewport({ 
                    scale: this.coverTransform.scale 
                });
                
                const tempCoverCanvas = document.createElement('canvas');
                tempCoverCanvas.width = scaledCoverViewport.width;
                tempCoverCanvas.height = scaledCoverViewport.height;
                const tempContext = tempCoverCanvas.getContext('2d');
                
                await coverPage.render({
                    canvasContext: tempContext,
                    viewport: scaledCoverViewport
                }).promise;
                
                context.save();
                context.shadowColor = 'rgba(0, 0, 0, 0.3)';
                context.shadowBlur = 8;
                context.shadowOffsetX = 4;
                context.shadowOffsetY = 4;
                
                context.drawImage(tempCoverCanvas, canvasX, canvasY);
                context.restore();
                console.log('Cover rendered using fallback method at:', canvasX, canvasY);
            }
        }
    }

    updateTechnicalInfo(text, pageCount = null) {
        const techInfo = document.getElementById('technicalInfo');
        if (pageCount) {
            techInfo.textContent = `PAGES: ${pageCount} | CITATIONS: ${this.selectedCitations.size} | COVER: ${this.selectedCover !== null ? this.selectedCover + 1 : 'NONE'}`;
        } else {
            techInfo.textContent = text;
        }
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);
    }

    async renderCompositionPreview() {
        console.log('RENDER COMPOSITION: Citations =', Array.from(this.selectedCitations), 'Cover =', this.selectedCover, 'Mode =', this.overlayMode);
        
        if (!this.currentPDF || this.selectedCitations.size === 0 || this.selectedCover === null) {
            console.log('Missing requirements for composition preview');
            return;
        }

        if (this.overlayMode === 'sidebyside') {
            return this.renderSideBySidePreview();
        } else {
            return this.renderCustomOverlayPreview();
        }
    }
    
    async renderCustomOverlayPreview() {
        console.log('RENDER CUSTOM OVERLAY PREVIEW');
        
        const canvas = document.getElementById('previewCanvas');
        if (!canvas) return;
        
        if (this._renderingInProgress) return;
        this._renderingInProgress = true;
        
        const context = canvas.getContext('2d');
        const container = canvas.parentElement;

        try {
            // Get first citation page
            const citationPageIndex = Array.from(this.selectedCitations)[0];
            
            // Get citation page
            const citationPage = await this.currentPDF.getPage(citationPageIndex + 1);
            const citationViewport = citationPage.getViewport({ scale: 1 });
            
            // Calculate main canvas size - use optimal dimensions for readability
            const aspectRatio = citationViewport.width / citationViewport.height;
            const maxWidth = Math.min(1000, window.innerWidth - 300); // Leave space for sidebar
            const maxHeight = Math.min(800, window.innerHeight - 200); // Leave space for controls
            
            let canvasWidth = maxWidth;
            let canvasHeight = canvasWidth / aspectRatio;
            
            if (canvasHeight > maxHeight) {
                canvasHeight = maxHeight;
                canvasWidth = canvasHeight * aspectRatio;
            }
            
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            canvas.style.display = 'block';
            
            // Hide placeholder
            const placeholder = container.querySelector('.preview-placeholder');
            if (placeholder) placeholder.style.display = 'none';
            
            // Clear canvas
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvasWidth, canvasHeight);
            
            // Calculate citation scale
            const citationScale = canvasWidth / citationViewport.width;
            const scaledCitationViewport = citationPage.getViewport({ scale: citationScale });
            
            // Render citation page (background)
            console.log('Rendering citation page', citationPageIndex + 1);
            await citationPage.render({
                canvasContext: context,
                viewport: scaledCitationViewport
            }).promise;
            
            console.log('Citation page rendered, setting up interactive cover');
            
            // Set up interactive cover overlay
            await this.setupInteractiveCover();
            
            console.log('Composition preview complete with interactive cover');
            
            // Enable export
            const exportBtn = document.getElementById('exportPreviewBtn');
            if (exportBtn) exportBtn.disabled = false;
            
        } catch (error) {
            console.error('Composition preview error:', error);
            // Clear canvas and show error
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = '#ff0000';
            context.font = '20px Arial';
            context.fillText('ERROR', 50, 100);
            context.font = '14px Arial';
            context.fillText(error.message, 50, 130);
        } finally {
            this._renderingInProgress = false;
        }
    }
    
    async renderSideBySidePreview() {
        console.log('RENDER SIDE BY SIDE PREVIEW');
        
        const canvas = document.getElementById('previewCanvas');
        if (!canvas) return;
        
        if (this._renderingInProgress) return;
        this._renderingInProgress = true;
        
        const context = canvas.getContext('2d');
        const container = canvas.parentElement;

        try {
            // Get citation and cover pages
            const citationPageIndex = Array.from(this.selectedCitations)[0];
            const coverPageIndex = this.selectedCover;
            
            const citationPage = await this.currentPDF.getPage(citationPageIndex + 1);
            const coverPage = await this.currentPDF.getPage(coverPageIndex + 1);
            
            const citationViewport = citationPage.getViewport({ scale: 1 });
            const coverViewport = coverPage.getViewport({ scale: 1 });
            
            // Calculate canvas size for side by side layout
            // Total width = citation width + cover width, height = max of both
            const maxPageHeight = Math.max(citationViewport.height, coverViewport.height);
            const totalWidth = citationViewport.width + coverViewport.width;
            const aspectRatio = totalWidth / maxPageHeight;
            
            // Apply same dynamic sizing logic as custom mode
            const maxWidth = Math.min(1400, window.innerWidth - 300); // Increased for side by side
            const maxHeight = Math.min(800, window.innerHeight - 200);
            
            let canvasWidth = maxWidth;
            let canvasHeight = canvasWidth / aspectRatio;
            
            if (canvasHeight > maxHeight) {
                canvasHeight = maxHeight;
                canvasWidth = canvasHeight * aspectRatio;
            }
            
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            canvas.style.display = 'block';
            
            // Hide placeholder
            const placeholder = container.querySelector('.preview-placeholder');
            if (placeholder) placeholder.style.display = 'none';
            
            // Clear canvas with white background
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvasWidth, canvasHeight);
            
            // Calculate scaling for each page to fit the allocated space
            const citationTargetWidth = canvasWidth * (citationViewport.width / totalWidth);
            const coverTargetWidth = canvasWidth * (coverViewport.width / totalWidth);
            
            const citationScale = citationTargetWidth / citationViewport.width;
            const coverScale = coverTargetWidth / coverViewport.width;
            
            // Calculate scaled dimensions
            const scaledCitationHeight = citationViewport.height * citationScale;
            const scaledCoverHeight = coverViewport.height * coverScale;
            
            // Center pages vertically if they're different heights
            const citationY = (canvasHeight - scaledCitationHeight) / 2;
            const coverY = (canvasHeight - scaledCoverHeight) / 2;
            
            // Render citation page on the left
            console.log('Rendering citation page', citationPageIndex + 1, 'at scale', citationScale);
            context.save();
            context.translate(0, citationY);
            await citationPage.render({
                canvasContext: context,
                viewport: citationPage.getViewport({ scale: citationScale })
            }).promise;
            context.restore();
            
            // Render cover page on the right
            console.log('Rendering cover page', coverPageIndex + 1, 'at scale', coverScale);
            context.save();
            context.translate(citationTargetWidth, coverY);
            await coverPage.render({
                canvasContext: context,
                viewport: coverPage.getViewport({ scale: coverScale })
            }).promise;
            context.restore();
            
            console.log('Side by side preview complete');
            
            // Enable export button
            const exportBtn = document.getElementById('exportPreviewBtn');
            if (exportBtn) exportBtn.disabled = false;
            
        } catch (error) {
            console.error('Side by side preview error:', error);
            // Clear canvas and show error
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = '#ff0000';
            context.font = '20px Arial';
            context.fillText('ERROR', 50, 100);
            context.font = '14px Arial';
            context.fillText(error.message, 50, 130);
        } finally {
            this._renderingInProgress = false;
        }
    }

    showPagePreview(pageIndex) {
        console.log('SHOW PAGE PREVIEW:', pageIndex);
        this.currentPreviewPage = pageIndex;
        // Clear composition state when showing single page
        // Don't clear selections, just show the page
        this.updatePreview();
    }

    updatePreviewVisibility() {
        this.updatePreview();
    }

    updatePreview() {
        console.log('UPDATE PREVIEW: Citations =', Array.from(this.selectedCitations), 'Cover =', this.selectedCover, 'CurrentPage =', this.currentPreviewPage);
        
        const previewPanel = document.getElementById('previewPanel');
        const resetCoverBtn = document.getElementById('resetCoverBtn');
        
        if (!previewPanel) {
            console.error('Preview panel not found!');
            return;
        }

        if (!this.currentPDF) {
            previewPanel.classList.add('hidden');
            return;
        }
        
        previewPanel.classList.remove('hidden');
        
        // Priority 1: Show composition if both citation and cover are selected
        if (this.selectedCitations.size > 0 && this.selectedCover !== null) {
            console.log('SHOWING COMPOSITION PREVIEW');
            this.renderCompositionPreview();
            if (resetCoverBtn) resetCoverBtn.style.display = 'block';
            return;
        }
        
        // Priority 2: Show current preview page if set
        if (this.currentPreviewPage !== null && this.currentPreviewPage >= 0) {
            console.log('SHOWING SINGLE PAGE PREVIEW:', this.currentPreviewPage);
            this.renderSinglePagePreview(this.currentPreviewPage);
            if (resetCoverBtn) resetCoverBtn.style.display = 'none';
            return;
        }
        
        // Priority 3: Show first page as fallback
        console.log('SHOWING FALLBACK PAGE PREVIEW');
        this.renderSinglePagePreview(0);
        if (resetCoverBtn) resetCoverBtn.style.display = 'none';
    }

    async renderSinglePagePreview(pageIndex) {
        console.log('RENDER SINGLE PAGE:', pageIndex);
        
        if (!this.currentPDF || pageIndex < 0 || pageIndex >= this.totalPages) {
            console.error('Invalid page index:', pageIndex);
            return;
        }

        const canvas = document.getElementById('previewCanvas');
        if (!canvas) return;
        
        // Hide interactive cover when showing single page
        const coverContainer = document.getElementById('coverImageContainer');
        if (coverContainer) {
            coverContainer.classList.add('hidden');
        }
        
        // Note: Render task cancellation disabled to prevent conflicts
        
        const context = canvas.getContext('2d');
        const container = canvas.parentElement;

        try {
            // Get the page
            const page = await this.currentPDF.getPage(pageIndex + 1);
            const viewport = page.getViewport({ scale: 1 });
            
            // Calculate canvas size - use optimal dimensions for readability
            const aspectRatio = viewport.width / viewport.height;
            const maxWidth = Math.min(1000, window.innerWidth - 300); // Leave space for sidebar
            const maxHeight = Math.min(800, window.innerHeight - 200); // Leave space for controls
            
            let canvasWidth = maxWidth;
            let canvasHeight = canvasWidth / aspectRatio;
            
            if (canvasHeight > maxHeight) {
                canvasHeight = maxHeight;
                canvasWidth = canvasHeight * aspectRatio;
            }
            
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            canvas.style.display = 'block';
            
            // Hide placeholder
            const placeholder = container.querySelector('.preview-placeholder');
            if (placeholder) placeholder.style.display = 'none';
            
            // Clear canvas
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvasWidth, canvasHeight);
            
            // Render the page
            const scale = canvasWidth / viewport.width;
            const scaledViewport = page.getViewport({ scale });
            
            await page.render({
                canvasContext: context,
                viewport: scaledViewport
            }).promise;
            
            console.log('Single page preview rendered for page:', pageIndex);
            
            // Update export button state for single page preview
            const exportBtn = document.getElementById('exportPreviewBtn');
            if (exportBtn) {
                exportBtn.disabled = !(this.selectedCitations.size > 0);
            }
            
        } catch (error) {
            console.error('Error rendering single page preview:', error);
            this.showToast('Failed to render page preview', 'error');
        }
    }

    // ============== COVER INTERACTION METHODS ==============

    setupCoverInteractions() {
        // This will be called when preview is shown to setup cover interaction events
        console.log('Setting up cover interaction events');
    }

    showCompositionPreview() {
        console.log('Showing composition preview');
        
        if (this.selectedCitations.size === 0) {
            this.showToast('Please select at least one citation page', 'error');
            return;
        }

        // Show preview panel and render composition
        this.showPreviewPanel();
        this.generateCompositionPreview();
        
        // If cover is selected, setup interactive cover
        if (this.selectedCover !== null) {
            setTimeout(() => this.setupInteractiveCover(), 100);
        }
    }

    showPreviewPanel() {
        const previewPanel = document.getElementById('previewPanel');
        if (previewPanel) {
            previewPanel.classList.remove('hidden');
        }
    }

    togglePreviewPanel() {
        const previewPanel = document.getElementById('previewPanel');
        if (previewPanel) {
            previewPanel.classList.toggle('hidden');
        }
    }

    async setupInteractiveCover() {
        if (this.selectedCover === null) return;
        
        console.log('Setting up interactive cover for page', this.selectedCover);
        
        try {
            // Get cover image from thumbnail
            const coverThumbnail = this.thumbnails[this.selectedCover];
            if (!coverThumbnail || !coverThumbnail.buffer) {
                console.warn('Cover thumbnail not available');
                return;
            }

            // Create cover canvas and render the cover page
            await this.createCoverCanvas(coverThumbnail);
            
            // Position cover initially
            this.resetCoverTransform();
            
            // Setup event listeners for interactions
            this.setupCoverEventListeners();
            
            // Show the cover container with validation
            const coverContainer = document.getElementById('coverImageContainer');
            if (coverContainer) {
                coverContainer.classList.remove('hidden');
                coverContainer.classList.add('selected');
                console.log('Cover container made visible and interactive');
            } else {
                console.error('Cannot show cover container - element not found');
                return;
            }

            // Update transform info
            this.updateCoverTransformInfo();

        } catch (error) {
            console.error('Error setting up interactive cover:', error);
        }
    }

    async createCoverCanvas(coverThumbnail) {
        const coverCanvas = document.getElementById('coverCanvas');
        const coverContainer = document.getElementById('coverImageContainer');
        
        if (!coverCanvas || !coverContainer) {
            console.error('Cover canvas or container not found:', { coverCanvas: !!coverCanvas, coverContainer: !!coverContainer });
            return;
        }

        const ctx = coverCanvas.getContext('2d');
        
        // Create image from thumbnail data
        const img = new Image();
        
        return new Promise((resolve, reject) => {
            img.onload = () => {
                // Set original dimensions
                this.coverTransform.originalWidth = img.width;
                this.coverTransform.originalHeight = img.height;
                
                // Calculate initial size (25% scale)
                const scaledWidth = img.width * this.coverTransform.scale;
                const scaledHeight = img.height * this.coverTransform.scale;
                
                // Set canvas size
                coverCanvas.width = scaledWidth;
                coverCanvas.height = scaledHeight;
                
                // Set container size
                coverContainer.style.width = scaledWidth + 'px';
                coverContainer.style.height = scaledHeight + 'px';
                
                // Draw the image
                ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);
                
                resolve();
            };
            
            img.onerror = reject;
            img.src = coverThumbnail.buffer;
        });
    }

    removeCoverEventListeners() {
        // Store references to avoid clone/replace which can break state
        if (this.boundCoverEventListeners) {
            const coverContainer = document.getElementById('coverImageContainer');
            if (coverContainer) {
                coverContainer.removeEventListener('mousedown', this.boundCoverEventListeners.mousedown);
                coverContainer.removeEventListener('touchstart', this.boundCoverEventListeners.touchstart);
                coverContainer.removeEventListener('wheel', this.boundCoverEventListeners.wheel);
            }
            
            document.removeEventListener('mousemove', this.boundCoverEventListeners.mousemove);
            document.removeEventListener('mouseup', this.boundCoverEventListeners.mouseup);
            document.removeEventListener('touchmove', this.boundCoverEventListeners.touchmove);
            document.removeEventListener('touchend', this.boundCoverEventListeners.touchend);
            
            this.boundCoverEventListeners = null;
        }
    }

    setupCoverEventListeners() {
        const coverContainer = document.getElementById('coverImageContainer');
        const previewCanvasContainer = document.querySelector('.preview-canvas-container');
        
        if (!coverContainer || !previewCanvasContainer) {
            console.error('Cannot setup cover event listeners - missing DOM elements:', {
                coverContainer: !!coverContainer,
                previewCanvasContainer: !!previewCanvasContainer
            });
            return;
        }
        
        // Remove existing listeners to prevent duplicates
        this.removeCoverEventListeners();

        // Create bound functions to store references
        this.boundCoverEventListeners = {
            mousedown: this.handleCoverMouseDown.bind(this),
            mousemove: this.handleCoverMouseMove.bind(this),
            mouseup: this.handleCoverMouseUp.bind(this),
            touchstart: this.handleCoverTouchStart.bind(this),
            touchmove: this.handleCoverTouchMove.bind(this),
            touchend: this.handleCoverTouchEnd.bind(this),
            wheel: this.handleCoverWheel.bind(this)
        };

        // Mouse events for dragging
        coverContainer.addEventListener('mousedown', this.boundCoverEventListeners.mousedown);
        document.addEventListener('mousemove', this.boundCoverEventListeners.mousemove);
        document.addEventListener('mouseup', this.boundCoverEventListeners.mouseup);

        // Touch events for mobile
        coverContainer.addEventListener('touchstart', this.boundCoverEventListeners.touchstart);
        document.addEventListener('touchmove', this.boundCoverEventListeners.touchmove);
        document.addEventListener('touchend', this.boundCoverEventListeners.touchend);

        // Wheel events for zoom
        coverContainer.addEventListener('wheel', this.boundCoverEventListeners.wheel);

        // Resize handle events
        const resizeHandles = coverContainer.querySelectorAll('.resize-handle');
        resizeHandles.forEach(handle => {
            handle.addEventListener('mousedown', this.handleResizeMouseDown.bind(this));
        });

        console.log('Cover event listeners setup complete');
    }

    handleCoverMouseDown(event) {
        console.log('=== COVER MOUSE DOWN ===');
        event.preventDefault();
        event.stopPropagation();
        
        if (event.target.classList.contains('resize-handle')) {
            console.log('Resize handle clicked - ignoring drag');
            return; // Handle resize separately
        }

        console.log('Setting isDragging = true');
        this.coverTransform.isDragging = true;
        this.coverTransform.startX = event.clientX - this.coverTransform.x;
        this.coverTransform.startY = event.clientY - this.coverTransform.y;
        
        const coverContainer = document.getElementById('coverImageContainer');
        const previewCanvasContainer = document.querySelector('.preview-canvas-container');
        
        if (coverContainer) {
            coverContainer.classList.add('dragging');
        }
        if (previewCanvasContainer) {
            previewCanvasContainer.classList.add('dragging-active');
        }
        
        // Add visual feedback to hint text
        const hintText = document.querySelector('.hint-text');
        if (hintText) {
            hintText.textContent = 'Dragging cover • Release to position';
        }

        console.log('Started dragging cover');
    }

    handleCoverMouseMove(event) {
        if (!this.coverTransform.isDragging) return;

        event.preventDefault();
        
        const newX = event.clientX - this.coverTransform.startX;
        const newY = event.clientY - this.coverTransform.startY;
        
        console.log('handleCoverMouseMove:', { newX, newY });
        
        // Apply boundary checking
        const constrainedPos = this.constrainCoverPosition(newX, newY);
        
        // Only update if position actually changed (prevents unnecessary redraws)
        if (this.coverTransform.x !== constrainedPos.x || this.coverTransform.y !== constrainedPos.y) {
            this.coverTransform.x = constrainedPos.x;
            this.coverTransform.y = constrainedPos.y;
            
            this.updateCoverPosition();
            this.updateCoverTransformInfo();
        }
    }

    handleCoverMouseUp(event) {
        if (!this.coverTransform.isDragging) return;
        
        this.coverTransform.isDragging = false;
        
        const coverContainer = document.getElementById('coverImageContainer');
        const previewCanvasContainer = document.querySelector('.preview-canvas-container');
        
        if (coverContainer) {
            coverContainer.classList.remove('dragging');
        }
        if (previewCanvasContainer) {
            previewCanvasContainer.classList.remove('dragging-active');
        }
        
        // Reset hint text
        const hintText = document.querySelector('.hint-text');
        if (hintText) {
            hintText.textContent = 'Drag cover to reposition • Pinch or scroll to resize';
        }

        console.log('Stopped dragging cover at position:', this.coverTransform.x, this.coverTransform.y);
    }

    handleCoverTouchStart(event) {
        if (event.touches.length === 1) {
            // Single touch - drag
            const touch = event.touches[0];
            this.handleCoverMouseDown({
                preventDefault: () => event.preventDefault(),
                stopPropagation: () => event.stopPropagation(),
                clientX: touch.clientX,
                clientY: touch.clientY,
                target: event.target
            });
        } else if (event.touches.length === 2) {
            // Two fingers - pinch to zoom
            this.handlePinchStart(event);
        }
    }

    handleCoverTouchMove(event) {
        if (event.touches.length === 1 && this.coverTransform.isDragging) {
            // Single touch - drag
            const touch = event.touches[0];
            this.handleCoverMouseMove({
                preventDefault: () => event.preventDefault(),
                clientX: touch.clientX,
                clientY: touch.clientY
            });
        } else if (event.touches.length === 2) {
            // Two fingers - pinch to zoom
            this.handlePinchMove(event);
        }
    }

    handleCoverTouchEnd(event) {
        if (event.touches.length === 0) {
            this.handleCoverMouseUp(event);
        }
    }

    handleCoverWheel(event) {
        event.preventDefault();
        
        const delta = event.deltaY > 0 ? -0.1 : 0.1;
        const newScale = Math.max(
            this.coverTransform.minScale,
            Math.min(this.coverTransform.maxScale, this.coverTransform.scale + delta)
        );
        
        this.updateCoverScale(newScale);
    }

    handlePinchStart(event) {
        if (event.touches.length !== 2) return;
        
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        
        this.coverTransform.isResizing = true;
        this.coverTransform.startScale = this.coverTransform.scale;
        this.coverTransform.initialPinchDistance = Math.sqrt(
            Math.pow(touch2.clientX - touch1.clientX, 2) + 
            Math.pow(touch2.clientY - touch1.clientY, 2)
        );
    }

    handlePinchMove(event) {
        if (!this.coverTransform.isResizing || event.touches.length !== 2) return;
        
        event.preventDefault();
        
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        
        const currentDistance = Math.sqrt(
            Math.pow(touch2.clientX - touch1.clientX, 2) + 
            Math.pow(touch2.clientY - touch1.clientY, 2)
        );
        
        const scaleMultiplier = currentDistance / this.coverTransform.initialPinchDistance;
        const newScale = Math.max(
            this.coverTransform.minScale,
            Math.min(this.coverTransform.maxScale, this.coverTransform.startScale * scaleMultiplier)
        );
        
        this.updateCoverScale(newScale);
    }

    handleResizeMouseDown(event) {
        event.preventDefault();
        event.stopPropagation();
        
        this.coverTransform.isResizing = true;
        this.coverTransform.startScale = this.coverTransform.scale;
        this.coverTransform.startX = event.clientX;
        this.coverTransform.startY = event.clientY;
        
        // Add document listeners for resize
        document.addEventListener('mousemove', this.handleResizeMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleResizeMouseUp.bind(this));
    }

    handleResizeMouseMove(event) {
        if (!this.coverTransform.isResizing) return;
        
        event.preventDefault();
        
        // Calculate scale change based on mouse movement
        const deltaX = event.clientX - this.coverTransform.startX;
        const scaleChange = deltaX * 0.005; // Adjust sensitivity
        
        const newScale = Math.max(
            this.coverTransform.minScale,
            Math.min(this.coverTransform.maxScale, this.coverTransform.startScale + scaleChange)
        );
        
        this.updateCoverScale(newScale);
    }

    handleResizeMouseUp(event) {
        this.coverTransform.isResizing = false;
        
        // Remove document listeners
        document.removeEventListener('mousemove', this.handleResizeMouseMove.bind(this));
        document.removeEventListener('mouseup', this.handleResizeMouseUp.bind(this));
    }

    updateCoverScale(newScale) {
        this.coverTransform.scale = newScale;
        
        // Recalculate dimensions
        const newWidth = this.coverTransform.originalWidth * newScale;
        const newHeight = this.coverTransform.originalHeight * newScale;
        
        // Update canvas and container
        const coverCanvas = document.getElementById('coverCanvas');
        const coverContainer = document.getElementById('coverImageContainer');
        
        if (coverCanvas && coverContainer) {
            // Redraw canvas at new size
            coverCanvas.width = newWidth;
            coverCanvas.height = newHeight;
            
            coverContainer.style.width = newWidth + 'px';
            coverContainer.style.height = newHeight + 'px';
            
            // Redraw the image
            const ctx = coverCanvas.getContext('2d');
            const coverThumbnail = this.thumbnails[this.selectedCover];
            
            if (coverThumbnail && coverThumbnail.buffer) {
                const img = new Image();
                img.onload = () => {
                    ctx.drawImage(img, 0, 0, newWidth, newHeight);
                };
                img.src = coverThumbnail.buffer;
            }
            
            // Constrain position after resize
            const constrainedPos = this.constrainCoverPosition(this.coverTransform.x, this.coverTransform.y);
            this.coverTransform.x = constrainedPos.x;
            this.coverTransform.y = constrainedPos.y;
            
            this.updateCoverPosition();
            this.updateCoverTransformInfo();
        }
    }

    constrainCoverPosition(x, y) {
        const coverContainer = document.getElementById('coverImageContainer');
        const previewCanvas = document.getElementById('previewCanvas');
        const previewCanvasContainer = document.querySelector('.preview-canvas-container');
        
        if (!coverContainer || !previewCanvas || !previewCanvasContainer) {
            console.log('constrainCoverPosition: Missing elements', { 
                coverContainer: !!coverContainer, 
                previewCanvas: !!previewCanvas,
                previewCanvasContainer: !!previewCanvasContainer 
            });
            return { x, y };
        }
        
        // Get the actual displayed canvas bounds (where the citation page is rendered)
        const canvasRect = previewCanvas.getBoundingClientRect();
        const containerRect = previewCanvasContainer.getBoundingClientRect();
        
        // Get cover dimensions
        const coverWidth = parseFloat(coverContainer.style.width) || coverContainer.offsetWidth;
        const coverHeight = parseFloat(coverContainer.style.height) || coverContainer.offsetHeight;
        
        console.log('constrainCoverPosition:', {
            input: { x, y },
            canvasDisplayRect: { 
                left: canvasRect.left, 
                top: canvasRect.top, 
                width: canvasRect.width, 
                height: canvasRect.height 
            },
            containerRect: { 
                left: containerRect.left, 
                top: containerRect.top, 
                width: containerRect.width, 
                height: containerRect.height 
            },
            cover: { width: coverWidth, height: coverHeight }
        });
        
        // Calculate boundaries using the actual citation page boundaries (canvas display area)
        // Convert canvas screen coordinates to container-relative coordinates
        const citationLeft = canvasRect.left - containerRect.left;
        const citationTop = canvasRect.top - containerRect.top;
        const citationRight = citationLeft + canvasRect.width;
        const citationBottom = citationTop + canvasRect.height;
        
        // Add small padding within the citation area
        const padding = 8;
        const minX = citationLeft + padding;
        const minY = citationTop + padding;
        const maxX = Math.max(minX, citationRight - coverWidth - padding);
        const maxY = Math.max(minY, citationBottom - coverHeight - padding);
        
        const constrained = {
            x: Math.max(minX, Math.min(maxX, x)),
            y: Math.max(minY, Math.min(maxY, y))
        };
        
        console.log('constrainCoverPosition result:', {
            citationBounds: { left: citationLeft, top: citationTop, right: citationRight, bottom: citationBottom },
            boundaries: { minX, minY, maxX, maxY },
            constrained
        });
        
        return constrained;
    }

    updateCoverPosition() {
        const coverContainer = document.getElementById('coverImageContainer');
        if (coverContainer) {
            coverContainer.style.left = this.coverTransform.x + 'px';
            coverContainer.style.top = this.coverTransform.y + 'px';
        }
    }

    updateCoverTransformInfo() {
        document.getElementById('coverPositionInfo').textContent = 
            `${Math.round(this.coverTransform.x)}, ${Math.round(this.coverTransform.y)}`;
        document.getElementById('coverScaleInfo').textContent = 
            `${Math.round(this.coverTransform.scale * 100)}%`;
        
        const width = Math.round(this.coverTransform.originalWidth * this.coverTransform.scale);
        const height = Math.round(this.coverTransform.originalHeight * this.coverTransform.scale);
        document.getElementById('coverSizeInfo').textContent = `${width} × ${height}`;
    }

    resetCoverTransform() {
        // Reset to default position and scale, positioning it inside the citation page area only
        const previewCanvas = document.getElementById('previewCanvas');
        const coverCanvas = document.getElementById('coverCanvas');
        const previewCanvasContainer = document.querySelector('.preview-canvas-container');
        
        console.log('=== RESET COVER TRANSFORM DEBUG ===');
        console.log('previewCanvas exists:', !!previewCanvas);
        console.log('previewCanvas width:', previewCanvas?.width);
        console.log('coverCanvas exists:', !!coverCanvas);
        console.log('coverCanvas dimensions:', coverCanvas?.width, 'x', coverCanvas?.height);
        
        if (previewCanvas && previewCanvas.width > 0 && coverCanvas && previewCanvasContainer) {
            this.coverTransform.scale = 0.25;
            
            // Calculate actual scaled cover dimensions
            const scaledCoverWidth = coverCanvas.width * this.coverTransform.scale;
            const scaledCoverHeight = coverCanvas.height * this.coverTransform.scale;
            
            // Get the actual citation page boundaries (canvas display area)
            const canvasRect = previewCanvas.getBoundingClientRect();
            const containerRect = previewCanvasContainer.getBoundingClientRect();
            
            // Calculate citation page bounds in container coordinates
            const citationLeft = canvasRect.left - containerRect.left;
            const citationTop = canvasRect.top - containerRect.top;
            const citationWidth = canvasRect.width;
            const citationHeight = canvasRect.height;
            
            // Position cover in the top-right area of the citation page with proper padding
            const padding = 20;
            const defaultX = citationLeft + citationWidth - scaledCoverWidth - padding;
            const defaultY = citationTop + padding;
            
            // Ensure position is within citation bounds
            this.coverTransform.x = Math.max(citationLeft + padding, Math.min(defaultX, citationLeft + citationWidth - scaledCoverWidth - padding));
            this.coverTransform.y = Math.max(citationTop + padding, Math.min(defaultY, citationTop + citationHeight - scaledCoverHeight - padding));
            
            console.log('Citation bounds positioning:', {
                citationBounds: { left: citationLeft, top: citationTop, width: citationWidth, height: citationHeight },
                coverDimensions: { width: scaledCoverWidth, height: scaledCoverHeight },
                finalPosition: { x: this.coverTransform.x, y: this.coverTransform.y }
            });
        } else {
            // Fallback if canvas not ready
            this.coverTransform.x = 20;
            this.coverTransform.y = 20;
            this.coverTransform.scale = 0.25;
            console.log('Using fallback cover position due to missing canvas elements');
        }
        
        // Update the cover visual state
        this.updateCoverScale(this.coverTransform.scale);
        this.updateCoverPosition();
        this.updateCoverTransformInfo();
        
        // Show reset feedback
        this.showToast('Cover position and size reset', 'success');
        
        console.log('Cover transform reset to position:', this.coverTransform.x, this.coverTransform.y);
    }
    
    handleModeSwitch(mode) {
        console.log('Mode switched to:', mode);
        
        // Update active state
        const modeBtns = document.querySelectorAll('.mode-btn');
        modeBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        
        // Update overlay mode
        this.overlayMode = mode;
        
        // Update preview display based on mode
        this.updatePreviewMode(mode);
        
        // Regenerate preview if active
        if (this.hasActivePreview()) {
            this.generateCompositionPreview();
        }
        
        // If switching to overlay mode and cover is selected, setup interactive cover
        if (mode === 'custom' && this.selectedCover !== null) {
            setTimeout(() => this.setupInteractiveCover(), 100);
        }
    }
    
    updatePreviewMode(mode) {
        const previewViewport = document.getElementById('previewViewport');
        const batchPreviewContainer = document.getElementById('batchPreviewContainer');
        const controlsPanel = document.getElementById('controlsPanel');
        
        if (mode === 'sidebyside') {
            // Show batch preview for side-by-side mode
            if (previewViewport) previewViewport.style.display = 'none';
            if (batchPreviewContainer) batchPreviewContainer.style.display = 'block';
            if (controlsPanel) controlsPanel.style.display = 'none';
        } else {
            // Show single preview for overlay mode
            if (previewViewport) previewViewport.style.display = 'flex';
            if (batchPreviewContainer) batchPreviewContainer.style.display = 'none';
            if (controlsPanel) controlsPanel.style.display = 'block';
        }
        
        // Hide/show interactive cover controls based on mode and cover selection
        const coverContainer = document.getElementById('coverImageContainer');
        if (coverContainer) {
            if (mode === 'sidebyside' || this.selectedCover === null) {
                coverContainer.classList.add('hidden');
            } else {
                coverContainer.classList.remove('hidden');
            }
        }
    }
    
    hasActivePreview() {
        const previewPanel = document.getElementById('previewPanel');
        return previewPanel && !previewPanel.classList.contains('hidden');
    }
    
    handleOverlayModeChange(event) {
        const newMode = event.target.value;
        console.log('Overlay mode changed to:', newMode);
        
        this.overlayMode = newMode;
        
        // Hide/show interactive cover controls based on mode
        const coverContainer = document.getElementById('coverImageContainer');
        const transformInfo = document.querySelector('.transform-info');
        
        if (newMode === 'sidebyside') {
            // Hide interactive cover controls for side by side mode
            if (coverContainer) {
                coverContainer.classList.add('hidden');
            }
            if (transformInfo) {
                transformInfo.style.display = 'none';
            }
        } else {
            // Show interactive cover controls for custom mode
            if (transformInfo) {
                transformInfo.style.display = 'block';
            }
        }
        
        // Re-render the composition preview with the new mode
        if (this.selectedCitations.size > 0 && this.selectedCover !== null) {
            this.renderCompositionPreview();
        }
    }

    closeSelectionPanel() {
        const selectionPanel = document.getElementById('selectionPanel');
        if (selectionPanel) {
            selectionPanel.classList.add('hidden');
        }
    }

    showSelectionPanel() {
        this.updateSelectionSummary();
        const selectionPanel = document.getElementById('selectionPanel');
        if (selectionPanel) {
            selectionPanel.classList.remove('hidden');
        }
    }

    updateSelectionSummary() {
        // Update enhanced selection summary in thumbnail panel
        const citationCountEl = document.getElementById('citationCount');
        const coverCountEl = document.getElementById('coverCount');
        
        if (citationCountEl) {
            citationCountEl.textContent = this.selectedCitations.size;
        }
        if (coverCountEl) {
            coverCountEl.textContent = this.selectedCover !== null ? '1' : '0';
        }
        
        // Legacy support for old selection panel
        const legacyCitationCountEl = document.getElementById('legacyCitationCount');
        const coverSelectionEl = document.getElementById('coverSelection');
        
        if (legacyCitationCountEl) {
            legacyCitationCountEl.textContent = this.selectedCitations.size;
        }
        if (coverSelectionEl) {
            coverSelectionEl.textContent = 
                this.selectedCover !== null ? `Page ${this.selectedCover + 1}` : 'NONE';
        }
        
        // Update compose button state
        const composeBtn = document.getElementById('composeBtn');
        const previewBtn = document.getElementById('previewBtn');
        
        if (composeBtn) {
            composeBtn.disabled = this.selectedCitations.size === 0;
        }
        if (previewBtn) {
            previewBtn.disabled = this.selectedCitations.size === 0;
        }
    }

    ensurePreviewVisible() {
        console.log('Ensuring preview visibility...');
        
        const previewPanel = document.getElementById('previewPanel');
        const previewCanvas = document.getElementById('previewCanvas');
        
        if (!previewPanel || !previewCanvas) {
            console.warn('Preview elements not found');
            return;
        }
        
        let changes = [];
        
        // Ensure the preview panel is visible
        if (previewPanel.classList.contains('hidden')) {
            previewPanel.classList.remove('hidden');
            changes.push('removed hidden class from preview panel');
        }
        
        // Ensure the canvas is visible
        if (previewCanvas.style.display === 'none') {
            previewCanvas.style.display = 'block';
            changes.push('set canvas display to block');
        }
        
        // Hide the placeholder if it's showing
        const placeholder = previewCanvas.parentElement.querySelector('.preview-placeholder');
        if (placeholder && placeholder.style.display !== 'none') {
            placeholder.style.display = 'none';
            changes.push('hid placeholder');
        }
        
        console.log('Preview visibility changes made:', changes.length > 0 ? changes : 'none');
    }

    refreshPreviewAfterExport() {
        // Re-render the current preview to ensure it's properly displayed
        console.log('Refreshing preview after export - currentPDF:', !!this.currentPDF, 'citations:', this.selectedCitations.size, 'cover:', this.selectedCover);
        
        if (this.currentPDF) {
            if (this.selectedCitations.size > 0 && this.selectedCover !== null) {
                // Re-render composition preview
                console.log('Refreshing composition preview after export');
                try {
                    this.renderCompositionPreview();
                } catch (error) {
                    console.error('Failed to refresh composition preview:', error);
                }
            } else if (this.currentPreviewPage !== null) {
                // Re-render single page preview
                console.log('Refreshing single page preview after export');
                try {
                    this.renderSinglePagePreview(this.currentPreviewPage);
                } catch (error) {
                    console.error('Failed to refresh single page preview:', error);
                }
            }
        } else {
            console.warn('No current PDF loaded, cannot refresh preview');
        }
    }
    
    // Cleanup methods for proper resource management
    cleanup() {
        console.log('Cleaning up PDF Composer resources...');
        
        // Cancel any ongoing thumbnail generation
        this.cancelThumbnailGeneration();
        
        // Clean up worker
        this.destroyWorker();
        
        // Clean up background processing
        this.deactivateBackgroundPreservation();
        
        // Clean up intervals
        this.cleanupIntervals();
        
        // Release wake lock
        this.releaseWakeLock();
        
        console.log('Cleanup completed');
    }
    
    cancelThumbnailGeneration() {
        if (this.currentTaskId && this.thumbnailWorker) {
            console.log('Cancelling thumbnail generation task:', this.currentTaskId);
            this.thumbnailWorker.postMessage({
                type: 'CANCEL_TASK',
                taskId: this.currentTaskId
            });
        }
        
        // Reset state
        this.isProcessing = false;
        this.processingStartTime = null;
        this.currentTaskId = null;
    }
    
    destroyWorker() {
        if (this.thumbnailWorker) {
            console.log('Terminating thumbnail worker');
            this.thumbnailWorker.terminate();
            this.thumbnailWorker = null;
        }
    }
    
    cleanupIntervals() {
        // Clear all intervals
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
        
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        if (this.throttlingDetectionInterval) {
            clearInterval(this.throttlingDetectionInterval);
            this.throttlingDetectionInterval = null;
        }
    }
}

// PDFComposerApp will be initialized by the script in index.html