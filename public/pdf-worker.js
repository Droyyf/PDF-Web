// PDF Worker - Background thumbnail generation
// This worker runs in a separate thread and is not affected by tab visibility

let pdfDocument = null;
let isProcessing = false;

// Listen for messages from main thread
self.addEventListener('message', async function(e) {
    const { type, data, taskId } = e.data;
    
    try {
        switch (type) {
            case 'INIT_PDF':
                await initializePDF(data.pdfData, taskId);
                break;
            case 'GENERATE_THUMBNAILS':
                await generateThumbnails(data, taskId);
                break;
            case 'CANCEL':
                isProcessing = false;
                self.postMessage({ type: 'CANCELLED', taskId });
                break;
            case 'PING':
                self.postMessage({ type: 'PONG', taskId });
                break;
        }
    } catch (error) {
        self.postMessage({ 
            type: 'ERROR', 
            error: error.message,
            taskId 
        });
    }
});

async function initializePDF(pdfData, taskId) {
    try {
        // Import PDF.js in worker context
        importScripts('./pdf.min.js');
        
        // Initialize PDF.js
        pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.js';
        
        // Load PDF document
        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        pdfDocument = await loadingTask.promise;
        
        self.postMessage({ 
            type: 'PDF_LOADED', 
            totalPages: pdfDocument.numPages,
            taskId 
        });
    } catch (error) {
        self.postMessage({ 
            type: 'ERROR', 
            error: 'Failed to initialize PDF: ' + error.message,
            taskId 
        });
    }
}

async function generateThumbnails({ totalPages, batchSize = 10 }, taskId) {
    if (!pdfDocument) {
        throw new Error('PDF not initialized');
    }
    
    isProcessing = true;
    const thumbnails = [];
    
    try {
        // Process in batches for progress updates
        for (let batch = 0; batch < Math.ceil(totalPages / batchSize) && isProcessing; batch++) {
            const batchThumbnails = [];
            const startPage = batch * batchSize + 1;
            const endPage = Math.min(startPage + batchSize - 1, totalPages);
            
            for (let pageNum = startPage; pageNum <= endPage && isProcessing; pageNum++) {
                try {
                    const thumbnail = await generateSingleThumbnail(pageNum);
                    batchThumbnails.push(thumbnail);
                } catch (pageError) {
                    // Add placeholder for failed page
                    batchThumbnails.push({
                        page: pageNum - 1,
                        buffer: null,
                        width: 200,
                        height: 300,
                        error: pageError.message
                    });
                }
                
                // Send individual page progress
                const overallProgress = 50 + (pageNum / totalPages) * 50;
                self.postMessage({
                    type: 'PROGRESS',
                    progress: overallProgress,
                    message: `Generating thumbnails... ${pageNum}/${totalPages}`,
                    pageNum,
                    totalPages,
                    taskId
                });
            }
            
            // Send batch of thumbnails
            self.postMessage({
                type: 'THUMBNAILS_BATCH',
                thumbnails: batchThumbnails,
                batchStart: startPage - 1,
                batchEnd: endPage - 1,
                taskId
            });
            
            thumbnails.push(...batchThumbnails);
        }
        
        if (isProcessing) {
            self.postMessage({
                type: 'THUMBNAILS_COMPLETE',
                thumbnails,
                taskId
            });
        }
    } catch (error) {
        self.postMessage({
            type: 'ERROR',
            error: 'Thumbnail generation failed: ' + error.message,
            taskId
        });
    } finally {
        isProcessing = false;
    }
}

async function generateSingleThumbnail(pageNum) {
    const page = await pdfDocument.getPage(pageNum);
    
    // Use smaller scale for large documents
    let scale = 0.3;
    const totalPages = pdfDocument.numPages;
    if (totalPages > 500) scale = 0.1;
    else if (totalPages > 200) scale = 0.15;
    
    const viewport = page.getViewport({ scale });
    
    // Create OffscreenCanvas if available, otherwise use regular canvas
    let canvas, context;
    if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(viewport.width, viewport.height);
        context = canvas.getContext('2d');
    } else {
        // Fallback to regular canvas (will be transferred back to main thread)
        canvas = new ImageData(viewport.width, viewport.height);
        // This will need to be handled differently in main thread
        throw new Error('OffscreenCanvas not supported, falling back to main thread');
    }
    
    // Render page to canvas
    await page.render({
        canvasContext: context,
        viewport: viewport
    }).promise;
    
    // Convert to data URL
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const dataURL = `data:image/png;base64,${base64}`;
    
    return {
        page: pageNum - 1,
        buffer: dataURL,
        width: viewport.width,
        height: viewport.height
    };
}