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

        // Preview panel controls
        const togglePreviewBtn = document.getElementById('togglePreview');
        const exportPreviewBtn = document.getElementById('exportPreviewBtn');
        const resetCoverBtn = document.getElementById('resetCoverBtn');
        
        if (togglePreviewBtn) {
            togglePreviewBtn.addEventListener('click', this.togglePreview.bind(this));
        }
        if (exportPreviewBtn) {
            exportPreviewBtn.addEventListener('click', this.exportComposition.bind(this));
        }
        if (resetCoverBtn) {
            resetCoverBtn.addEventListener('click', this.resetCoverTransform.bind(this));
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

        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyPress.bind(this));
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
        
        try {
            await this.uploadPDF(file);
        } catch (error) {
            console.error('Upload error:', error);
            this.showToast('Failed to upload PDF: ' + error.message, 'error');
            this.showEmptyState();
        }
    }

    async uploadPDF(file) {
        const formData = new FormData();
        formData.append('pdf', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.success) {
                this.fileId = result.fileId;
                this.totalPages = result.pageCount;
                this.thumbnails = result.thumbnails;
                
                await this.loadPDFForViewing(file);
                this.updateTechnicalInfo(result.filename, result.pageCount);
                this.showToast('PDF loaded successfully', 'success');
            } else {
                throw new Error(result.error || 'Upload failed');
            }
        } catch (error) {
            throw new Error(`Network error: ${error.message}`);
        }
    }

    async loadPDFForViewing(file) {
        try {
            console.log('Loading PDF for viewing, file size:', file.size, 'bytes');
            
            // Check if PDF.js is available
            if (typeof pdfjsLib === 'undefined') {
                throw new Error('PDF.js library not loaded');
            }

            const arrayBuffer = await file.arrayBuffer();
            console.log('PDF array buffer created, size:', arrayBuffer.byteLength);
            
            this.currentPDF = await pdfjsLib.getDocument(arrayBuffer).promise;
            console.log('PDF document loaded, pages:', this.currentPDF.numPages);
            
            // Verify page count matches
            if (this.totalPages !== this.currentPDF.numPages) {
                console.warn('Page count mismatch - server:', this.totalPages, 'client:', this.currentPDF.numPages);
                this.totalPages = this.currentPDF.numPages;
            }
            
            this.currentPage = 0;
            
            // Generate thumbnails for all pages
            console.log('Starting thumbnail generation...');
            await this.generateAllThumbnails();
            console.log('Thumbnail generation completed');
            
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
            throw new Error(`Failed to load PDF for viewing: ${error.message}`);
        }
    }

    async generateAllThumbnails() {
        if (!this.currentPDF) return;

        console.log('Generating thumbnails for', this.totalPages, 'pages...');
        this.thumbnails = [];

        try {
            for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
                const page = await this.currentPDF.getPage(pageNum);
                const viewport = page.getViewport({ scale: 0.3 }); // Small scale for thumbnails
                
                // Create canvas for thumbnail
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                // Render page to canvas
                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;

                // Convert to base64
                const thumbnailDataURL = canvas.toDataURL('image/png');
                
                this.thumbnails.push({
                    page: pageNum - 1,
                    buffer: thumbnailDataURL,
                    width: viewport.width,
                    height: viewport.height
                });

                // Update progress for user feedback
                if (pageNum % 2 === 0 || pageNum === this.totalPages) {
                    console.log(`Generated ${pageNum}/${this.totalPages} thumbnails`);
                    // Allow UI to update during thumbnail generation
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            }
            console.log('All thumbnails generated successfully');
        } catch (error) {
            console.error('Error generating thumbnails:', error);
            // Create placeholder thumbnails if generation fails
            this.thumbnails = Array.from({ length: this.totalPages }, (_, i) => ({
                page: i,
                buffer: null,
                width: 200,
                height: 300
            }));
        }
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
        
        console.log(`Updating thumbnail ${pageIndex}: citation=${isCitation}, cover=${isCover}`);
        
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
        this.updatePreviewVisibility();
        
        console.log('=== CITATION SELECTION COMPLETE ===');
    }

    toggleCoverSelection(pageIndex) {
        console.log('=== TOGGLING COVER SELECTION ===');
        console.log('Page index:', pageIndex);
        console.log('Current cover:', this.selectedCover);
        
        if (this.selectedCover === pageIndex) {
            this.selectedCover = null;
            console.log('Removed cover selection');
        } else {
            this.selectedCover = pageIndex;
            console.log('Set cover to:', pageIndex);
        }
        
        console.log('Citations selected:', Array.from(this.selectedCitations));
        console.log('Cover selected:', this.selectedCover);
        
        // Update all thumbnails since cover selection is exclusive
        this.renderThumbnails();
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
        
        if (this.selectedCitations.size > 0) {
            this.generateCompositionPreview();
        }
    }

    hidePreview() {
        const previewPanel = document.getElementById('previewPanel');
        previewPanel.classList.add('hidden');
    }

    async generateCompositionPreview() {
        if (!this.currentPDF || this.selectedCitations.size === 0) return;

        const previewCanvas = document.getElementById('previewCanvas');
        const placeholder = previewCanvas.parentElement.querySelector('.preview-placeholder');
        const context = previewCanvas.getContext('2d');

        try {
            // Hide placeholder and show canvas
            placeholder.style.display = 'none';
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
            
            // Setup interactive cover if selected
            if (this.selectedCover !== null) {
                await this.setupInteractiveCover();
            }
            
            // Enable export button if we have composition (citations + cover)
            const exportBtn = document.getElementById('exportPreviewBtn');
            if (exportBtn) {
                exportBtn.disabled = !(this.selectedCitations.size > 0 && this.selectedCover !== null);
            }
            
        } catch (error) {
            console.error('Preview generation error:', error);
            placeholder.style.display = 'block';
            previewCanvas.style.display = 'none';
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

    async exportComposition() {
        console.log('Export composition started');
        
        const format = document.getElementById('previewExportFormat').value;
        const exportBtn = document.getElementById('exportPreviewBtn');
        const originalText = exportBtn.textContent;
        
        // Check preview panel state before export
        const previewPanel = document.getElementById('previewPanel');
        const previewCanvas = document.getElementById('previewCanvas');
        const wasPreviewVisible = !previewPanel.classList.contains('hidden');
        console.log('Preview panel visible before export:', wasPreviewVisible);
        console.log('Preview canvas dimensions before export:', previewCanvas ? previewCanvas.width + 'x' + previewCanvas.height : 'canvas not found');
        
        exportBtn.textContent = 'EXPORTING...';
        exportBtn.disabled = true;
        
        // Set export flag to prevent canvas interference
        this._exportInProgress = true;
        
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
            
            // Clear export flag
            this._exportInProgress = false;
            
            // Ensure preview remains visible after export - do this immediately
            setTimeout(() => {
                this.ensurePreviewVisible();
                // Small delay before refresh to prevent visual flickering
                setTimeout(() => {
                    this.refreshPreviewAfterExport();
                }, 50);
            }, 10);
        }
    }

    async exportCurrentComposition(format) {
        console.log('Exporting current composition in format:', format);
        
        if (!this.currentPDF || this.selectedCitations.size === 0 || this.selectedCover === null) {
            throw new Error('Missing PDF, citations, or cover selection');
        }

        try {
            // Get the current preview canvas
            const previewCanvas = document.getElementById('previewCanvas');
            if (!previewCanvas) {
                throw new Error('Preview canvas not found');
            }

            console.log('Found preview canvas, checking dimensions:', previewCanvas.width, 'x', previewCanvas.height);
            
            if (previewCanvas.width === 0 || previewCanvas.height === 0) {
                throw new Error('Preview canvas is empty - please ensure composition is rendered first');
            }

            if (format === 'png') {
                // Export as PNG - wrap in promise to make it awaitable
                await new Promise((resolve, reject) => {
                    previewCanvas.toBlob((blob) => {
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
                    previewCanvas.toBlob((blob) => {
                        if (blob) {
                            this.downloadFile(blob, 'composition.jpg', 'image/jpeg');
                            resolve();
                        } else {
                            reject(new Error('Failed to create JPEG blob'));
                        }
                    }, 'image/jpeg', 0.9);
                });
            } else if (format === 'pdf') {
                // Export as PDF using current canvas
                const imageData = previewCanvas.toDataURL('image/png');
                if (!imageData || imageData === 'data:,') {
                    throw new Error('Failed to get canvas image data');
                }
                await this.exportCanvasToPDF(previewCanvas, imageData);
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
        console.log('Downloading file:', filename);
        
        const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 1000);
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
        // Get preview canvas container dimensions to calculate scale
        const previewCanvasContainer = document.querySelector('.preview-canvas-container');
        const containerRect = previewCanvasContainer.getBoundingClientRect();
        
        // Calculate the ratio between export canvas and preview container
        const scaleRatioX = canvasWidth / containerRect.width;
        const scaleRatioY = canvasHeight / containerRect.height;
        
        // Use the smaller ratio to maintain proportions
        const scaleRatio = Math.min(scaleRatioX, scaleRatioY);
        
        // Calculate cover dimensions based on user's transform
        const coverWidth = this.coverTransform.originalWidth * this.coverTransform.scale * scaleRatio;
        const coverHeight = this.coverTransform.originalHeight * this.coverTransform.scale * scaleRatio;
        
        // Calculate position based on user's transform
        const coverX = this.coverTransform.x * scaleRatio;
        const coverY = this.coverTransform.y * scaleRatio;
        
        return {
            x: coverX,
            y: coverY,
            width: coverWidth,
            height: coverHeight
        };
    }

    async renderCoverOverlay(context, coverDimensions) {
        try {
            const coverPage = await this.currentPDF.getPage(this.selectedCover + 1);
            const viewport = coverPage.getViewport({ scale: 1 });
            
            // Calculate scale to match the cover dimensions
            const scaleX = coverDimensions.width / viewport.width;
            const scaleY = coverDimensions.height / viewport.height;
            const scale = Math.min(scaleX, scaleY);
            
            const scaledViewport = coverPage.getViewport({ scale });
            
            // Create temporary canvas for cover
            const coverCanvas = document.createElement('canvas');
            const coverContext = coverCanvas.getContext('2d');
            coverCanvas.width = scaledViewport.width;
            coverCanvas.height = scaledViewport.height;
            
            // Render cover page
            await coverPage.render({
                canvasContext: coverContext,
                viewport: scaledViewport
            }).promise;
            
            // Add subtle shadow effect
            context.shadowColor = 'rgba(0, 0, 0, 0.3)';
            context.shadowBlur = 5;
            context.shadowOffsetX = 2;
            context.shadowOffsetY = 2;
            
            // Draw cover at the exact user position
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
            
            console.log('Cover overlay rendered at position:', coverDimensions);
            
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

    downloadFile(data, filename, mimeType) {
        const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up object URL
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }

    showEmptyState() {
        document.getElementById('emptyState').classList.remove('hidden');
        document.getElementById('pdfViewer').classList.add('hidden');
        document.getElementById('loadingState').classList.add('hidden');
        this.updateTechnicalInfo('PDF VIEWER IDLE // WAITING FOR INPUT');
    }

    showLoadingState() {
        document.getElementById('emptyState').classList.add('hidden');
        document.getElementById('pdfViewer').classList.add('hidden');
        document.getElementById('loadingState').classList.remove('hidden');
        this.updateTechnicalInfo('LOADING PDF DOCUMENT...');
        
        // Simulate progress for user feedback
        this.simulateProgress();
    }

    showPDFViewer() {
        document.getElementById('emptyState').classList.add('hidden');
        document.getElementById('loadingState').classList.add('hidden');
        document.getElementById('pdfViewer').classList.remove('hidden');
    }

    simulateProgress() {
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        let progress = 0;

        // Clear any existing interval
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }

        this.progressInterval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress > 85) progress = 85; // Stop at 85% instead of 95%
            
            progressFill.style.width = progress + '%';
            progressText.textContent = Math.round(progress) + '%';
            
            if (progress >= 85) {
                clearInterval(this.progressInterval);
                this.progressInterval = null;
            }
        }, 150); // Faster updates
    }

    completeProgress() {
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        // Clear any existing interval
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
        
        // Smoothly complete to 100%
        let currentProgress = parseInt(progressText.textContent) || 85;
        const completeInterval = setInterval(() => {
            currentProgress += 3;
            if (currentProgress >= 100) {
                currentProgress = 100;
                clearInterval(completeInterval);
            }
            
            progressFill.style.width = currentProgress + '%';
            progressText.textContent = currentProgress + '%';
        }, 50);
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
        console.log('RENDER COMPOSITION: Citations =', Array.from(this.selectedCitations), 'Cover =', this.selectedCover);
        
        if (!this.currentPDF || this.selectedCitations.size === 0 || this.selectedCover === null) {
            console.log('Missing requirements for composition preview');
            return;
        }

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
            
            // Calculate main canvas size
            const containerWidth = container.clientWidth - 40;
            const containerHeight = container.clientHeight - 40;
            const aspectRatio = citationViewport.width / citationViewport.height;
            
            let canvasWidth = Math.min(containerWidth, 500);
            let canvasHeight = canvasWidth / aspectRatio;
            
            if (canvasHeight > containerHeight) {
                canvasHeight = containerHeight;
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
            
            // Render citation page
            console.log('Rendering citation page', citationPageIndex + 1);
            await citationPage.render({
                canvasContext: context,
                viewport: scaledCitationViewport
            }).promise;
            
            // Get cover page
            const coverPage = await this.currentPDF.getPage(this.selectedCover + 1);
            const coverViewport = coverPage.getViewport({ scale: 1 });
            
            // Calculate cover size (25% of citation width)
            const coverTargetWidth = canvasWidth * 0.25;
            const coverScale = coverTargetWidth / coverViewport.width;
            const scaledCoverViewport = coverPage.getViewport({ scale: coverScale });
            
            console.log('Cover dimensions: target width =', coverTargetWidth, 'actual =', scaledCoverViewport.width);
            
            // Create temp canvas for cover
            const coverCanvas = document.createElement('canvas');
            const coverContext = coverCanvas.getContext('2d');
            coverCanvas.width = scaledCoverViewport.width;
            coverCanvas.height = scaledCoverViewport.height;
            
            // Render cover page
            console.log('Rendering cover page', this.selectedCover + 1);
            await coverPage.render({
                canvasContext: coverContext,
                viewport: scaledCoverViewport
            }).promise;
            
            // Position cover (top-right with margin)
            const coverX = canvasWidth - scaledCoverViewport.width - 20;
            const coverY = 20;
            
            // Draw cover with shadow
            context.save();
            context.shadowColor = 'rgba(0, 0, 0, 0.3)';
            context.shadowBlur = 8;
            context.shadowOffsetX = 4;
            context.shadowOffsetY = 4;
            
            context.drawImage(coverCanvas, coverX, coverY);
            context.restore();
            
            // Add border around cover
            context.strokeStyle = '#ff6b9d';
            context.lineWidth = 3;
            context.strokeRect(coverX - 2, coverY - 2, scaledCoverViewport.width + 4, scaledCoverViewport.height + 4);
            
            // Add labels
            context.fillStyle = '#000';
            context.font = 'bold 16px Arial';
            context.fillText(`Citation: Page ${citationPageIndex + 1}`, 15, canvasHeight - 50);
            
            context.fillStyle = '#ff6b9d';
            context.fillText(`Cover: Page ${this.selectedCover + 1}`, 15, canvasHeight - 25);
            
            console.log('Composition preview complete');
            
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
        
        const context = canvas.getContext('2d');
        const container = canvas.parentElement;

        try {
            // Get the page
            const page = await this.currentPDF.getPage(pageIndex + 1);
            const viewport = page.getViewport({ scale: 1 });
            
            // Calculate canvas size
            const containerWidth = container.clientWidth - 40;
            const containerHeight = container.clientHeight - 40;
            const aspectRatio = viewport.width / viewport.height;
            
            let canvasWidth = Math.min(containerWidth, 500);
            let canvasHeight = canvasWidth / aspectRatio;
            
            if (canvasHeight > containerHeight) {
                canvasHeight = containerHeight;
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
            const scale = canvasWidth / pageViewport.width;
            const scaledViewport = page.getViewport({ scale });
            
            await page.render({
                canvasContext: context,
                viewport: scaledViewport
            }).promise;
            
            console.log('Single page preview rendered for page:', pageIndex);
            
            // Update export button state for single page preview
            const exportBtn = document.getElementById('exportPreviewBtn');
            if (exportBtn) {
                exportBtn.disabled = !(this.selectedCitations.size > 0 && this.selectedCover !== null);
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
            
            // Show the cover container
            const coverContainer = document.getElementById('coverImageContainer');
            if (coverContainer) {
                coverContainer.classList.remove('hidden');
                coverContainer.classList.add('selected');
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
        
        if (!coverCanvas || !coverContainer) return;

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

    setupCoverEventListeners() {
        const coverContainer = document.getElementById('coverImageContainer');
        const previewCanvasContainer = document.querySelector('.preview-canvas-container');
        
        if (!coverContainer || !previewCanvasContainer) return;

        // Mouse events for dragging
        coverContainer.addEventListener('mousedown', this.handleCoverMouseDown.bind(this));
        document.addEventListener('mousemove', this.handleCoverMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleCoverMouseUp.bind(this));

        // Touch events for mobile
        coverContainer.addEventListener('touchstart', this.handleCoverTouchStart.bind(this));
        document.addEventListener('touchmove', this.handleCoverTouchMove.bind(this));
        document.addEventListener('touchend', this.handleCoverTouchEnd.bind(this));

        // Wheel events for zoom
        coverContainer.addEventListener('wheel', this.handleCoverWheel.bind(this));

        // Resize handle events
        const resizeHandles = coverContainer.querySelectorAll('.resize-handle');
        resizeHandles.forEach(handle => {
            handle.addEventListener('mousedown', this.handleResizeMouseDown.bind(this));
        });

        console.log('Cover event listeners setup complete');
    }

    handleCoverMouseDown(event) {
        event.preventDefault();
        event.stopPropagation();
        
        if (event.target.classList.contains('resize-handle')) {
            return; // Handle resize separately
        }

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
        const previewCanvasContainer = document.querySelector('.preview-canvas-container');
        
        if (!coverContainer || !previewCanvasContainer) {
            return { x, y };
        }
        
        // Get container dimensions (accounting for padding/borders)
        const containerStyle = window.getComputedStyle(previewCanvasContainer);
        const containerWidth = previewCanvasContainer.clientWidth;
        const containerHeight = previewCanvasContainer.clientHeight;
        
        // Get cover dimensions
        const coverWidth = parseFloat(coverContainer.style.width) || coverContainer.offsetWidth;
        const coverHeight = parseFloat(coverContainer.style.height) || coverContainer.offsetHeight;
        
        // Calculate boundaries with some padding
        const padding = 5;
        const minX = padding;
        const minY = padding;
        const maxX = Math.max(padding, containerWidth - coverWidth - padding);
        const maxY = Math.max(padding, containerHeight - coverHeight - padding);
        
        return {
            x: Math.max(minX, Math.min(maxX, x)),
            y: Math.max(minY, Math.min(maxY, y))
        };
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
        // Reset to default position and scale
        this.coverTransform.x = 10;
        this.coverTransform.y = 10;
        this.coverTransform.scale = 0.25;
        
        // Update the cover visual state
        this.updateCoverScale(this.coverTransform.scale);
        this.updateCoverPosition();
        this.updateCoverTransformInfo();
        
        // Show reset feedback
        this.showToast('Cover position and size reset', 'success');
        
        console.log('Cover transform reset');
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
        const citationCountEl = document.getElementById('citationCount');
        const coverSelectionEl = document.getElementById('coverSelection');
        
        if (citationCountEl) {
            citationCountEl.textContent = this.selectedCitations.size;
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
}

// PDFComposerApp will be initialized by the script in index.html