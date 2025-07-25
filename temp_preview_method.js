    async renderCompositionPreview() {
        console.log('Starting renderCompositionPreview...');
        
        if (!this.currentPDF || this.selectedCitations.size === 0 || this.selectedCover === null) {
            console.log('Cannot render preview - missing requirements');
            return;
        }

        const canvas = document.getElementById('previewCanvas');
        if (!canvas) {
            console.error('Preview canvas not found!');
            return;
        }
        
        const context = canvas.getContext('2d');
        const container = canvas.parentElement;

        try {
            console.log('Rendering preview for citations:', Array.from(this.selectedCitations), 'cover:', this.selectedCover);
            
            // Get selected citation pages in order
            const citationPages = Array.from(this.selectedCitations).sort((a, b) => a - b);
            
            // Calculate preview dimensions - make canvas fit container
            const containerWidth = container.clientWidth - 40; // Account for padding
            const containerHeight = container.clientHeight - 40;
            
            // Get first citation page to calculate aspect ratio
            const firstPage = await this.currentPDF.getPage(citationPages[0] + 1);
            const pageViewport = firstPage.getViewport({ scale: 1 });
            const pageAspectRatio = pageViewport.width / pageViewport.height;
            
            // Calculate canvas size to fit container while maintaining aspect ratio
            let canvasWidth = Math.min(containerWidth, 400); // Max width 400px
            let canvasHeight = canvasWidth / pageAspectRatio;
            
            // Adjust if too tall
            if (canvasHeight > containerHeight) {
                canvasHeight = containerHeight;
                canvasWidth = containerHeight * pageAspectRatio;
            }
            
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            canvas.style.display = 'block';
            
            // Hide placeholder
            const placeholder = container.querySelector('.preview-placeholder');
            if (placeholder) {
                placeholder.style.display = 'none';
            }
            
            // Clear canvas with white background
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            
            // Render the first citation page as background
            const firstCitationPage = await this.currentPDF.getPage(citationPages[0] + 1);
            const scale = canvasWidth / pageViewport.width;
            const scaledViewport = firstCitationPage.getViewport({ scale });
            
            await firstCitationPage.render({
                canvasContext: context,
                viewport: scaledViewport
            }).promise;
            
            console.log('Citation page rendered');
            
            // Now render the cover page at 25% size on top
            const coverPage = await this.currentPDF.getPage(this.selectedCover + 1);
            const coverViewport = coverPage.getViewport({ scale: scale * 0.25 }); // 25% size
            
            // Create temporary canvas for cover
            const coverCanvas = document.createElement('canvas');
            const coverContext = coverCanvas.getContext('2d');
            coverCanvas.width = coverViewport.width;
            coverCanvas.height = coverViewport.height;
            
            // Render cover page to temporary canvas
            await coverPage.render({
                canvasContext: coverContext,
                viewport: coverViewport
            }).promise;
            
            console.log('Cover page rendered');
            
            // Draw cover on top of citation page (positioned at top-right)
            const coverX = canvasWidth - coverViewport.width - 10; // 10px margin from right
            const coverY = 10; // 10px margin from top
            
            // Add shadow effect
            context.shadowColor = 'rgba(0, 0, 0, 0.3)';
            context.shadowBlur = 5;
            context.shadowOffsetX = 2;
            context.shadowOffsetY = 2;
            
            // Draw cover image
            context.drawImage(coverCanvas, coverX, coverY);
            
            // Reset shadow
            context.shadowColor = 'transparent';
            context.shadowBlur = 0;
            context.shadowOffsetX = 0;
            context.shadowOffsetY = 0;
            
            console.log('Cover overlay applied');
            
            // Show export controls
            const exportControls = document.querySelector('.export-controls');
            if (exportControls) {
                exportControls.style.display = 'block';
            }
            
            console.log('Preview composition complete!');
            
        } catch (error) {
            console.error('Error rendering composition preview:', error);
            this.showToast('Failed to render preview', 'error');
        }
    }