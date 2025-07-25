const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs').promises;
const { PDFDocument, rgb } = require('pdf-lib');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            objectSrc: ["'none'"],
            workerSrc: ["'self'", "blob:", "https://cdnjs.cloudflare.com"]
        }
    }
}));

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    }
});

// Create uploads directory if it doesn't exist
const initDirectories = async () => {
    try {
        await fs.mkdir('uploads', { recursive: true });
        await fs.mkdir('temp', { recursive: true });
        console.log('Directories initialized');
    } catch (error) {
        console.error('Error creating directories:', error);
    }
};

// PDF Service equivalent - memory-efficient PDF operations
class PDFService {
    constructor() {
        this.maxCacheSize = 100 * 1024 * 1024; // 100MB cache limit
        this.cache = new Map();
        this.accessOrder = [];
        this.currentCacheSize = 0;
    }

    async loadPDF(filePath) {
        try {
            const pdfBytes = await fs.readFile(filePath);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            return {
                document: pdfDoc,
                pageCount: pdfDoc.getPageCount(),
                bytes: pdfBytes
            };
        } catch (error) {
            throw new Error(`Failed to load PDF: ${error.message}`);
        }
    }

    async generateThumbnails(filePath, pageCount) {
        // For now, return placeholder thumbnails since we removed pdf2pic
        // In a production version, you would implement PDF to image conversion
        const thumbnails = [];
        
        try {
            for (let i = 0; i < Math.min(pageCount, 100); i++) {
                thumbnails.push({
                    page: i,
                    buffer: null, // No thumbnail buffer for now
                    width: 200,
                    height: 300
                });
            }
            return thumbnails;
        } catch (error) {
            console.error('Thumbnail generation error:', error);
            return Array.from({ length: pageCount }, (_, i) => ({
                page: i,
                buffer: null,
                width: 200,
                height: 300
            }));
        }
    }

    async exportPDF(pdfDoc, format = 'pdf', quality = 0.9) {
        try {
            // For now, only support PDF export
            return await pdfDoc.save();
        } catch (error) {
            throw new Error(`Export failed: ${error.message}`);
        }
    }
}

// Composer equivalent - PDF merging and composition
class Composer {
    static async merge(pdfPaths, selectedPages, coverPage = null, coverPlacement = 'top') {
        try {
            const mergedPdf = await PDFDocument.create();
            
            // Process cover if provided
            if (coverPage !== null) {
                const coverPdfPath = pdfPaths[0]; // Assuming cover comes from same document
                const coverPdfBytes = await fs.readFile(coverPdfPath);
                const coverPdf = await PDFDocument.load(coverPdfBytes);
                
                if (coverPage < coverPdf.getPageCount()) {
                    const [copiedCoverPage] = await mergedPdf.copyPages(coverPdf, [coverPage]);
                    
                    const insertIndex = this.getCoverInsertIndex(coverPlacement, selectedPages.length);
                    if (insertIndex === 0) {
                        mergedPdf.insertPage(0, copiedCoverPage);
                    }
                }
            }

            // Process selected citation pages
            for (const pdfPath of pdfPaths) {
                const pdfBytes = await fs.readFile(pdfPath);
                const pdf = await PDFDocument.load(pdfBytes);
                
                // Filter pages based on selection
                const pagesToCopy = selectedPages.filter(pageIndex => pageIndex < pdf.getPageCount());
                
                if (pagesToCopy.length > 0) {
                    const copiedPages = await mergedPdf.copyPages(pdf, pagesToCopy);
                    copiedPages.forEach(page => mergedPdf.addPage(page));
                }
            }

            return await mergedPdf.save();
        } catch (error) {
            throw new Error(`PDF composition failed: ${error.message}`);
        }
    }

    static getCoverInsertIndex(placement, pageCount) {
        switch (placement) {
            case 'top':
            case 'topLeft':
            case 'topRight':
                return 0;
            case 'center':
            case 'left':
            case 'right':
                return Math.floor(pageCount / 2);
            case 'bottom':
            case 'bottomLeft':
            case 'bottomRight':
                return pageCount;
            default:
                return 0;
        }
    }
}

// Initialize services
const pdfService = new PDFService();

// Routes

// Upload PDF endpoint
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        const pdfData = await pdfService.loadPDF(req.file.path);
        const thumbnails = await pdfService.generateThumbnails(req.file.path, pdfData.pageCount);

        res.json({
            success: true,
            fileId: req.file.filename,
            pageCount: pdfData.pageCount,
            thumbnails: thumbnails,
            filename: req.file.originalname
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get PDF info endpoint
app.get('/api/pdf/:fileId/info', async (req, res) => {
    try {
        const filePath = path.join('uploads', req.params.fileId);
        const pdfData = await pdfService.loadPDF(filePath);
        
        res.json({
            pageCount: pdfData.pageCount,
            filename: req.params.fileId
        });
    } catch (error) {
        res.status(404).json({ error: 'PDF not found' });
    }
});

// Generate thumbnails endpoint
app.get('/api/pdf/:fileId/thumbnails', async (req, res) => {
    try {
        const filePath = path.join('uploads', req.params.fileId);
        const pdfData = await pdfService.loadPDF(filePath);
        const thumbnails = await pdfService.generateThumbnails(filePath, pdfData.pageCount);
        
        res.json({
            thumbnails: thumbnails
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Compose PDF endpoint
app.post('/api/compose', async (req, res) => {
    try {
        const { fileId, selectedPages, coverPage, coverPlacement, exportFormat } = req.body;
        
        if (!fileId || !selectedPages || selectedPages.length === 0) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const filePath = path.join('uploads', fileId);
        const composedPdfBytes = await Composer.merge([filePath], selectedPages, coverPage, coverPlacement);
        
        // Generate output filename
        const timestamp = Date.now();
        const outputFilename = `composed-${timestamp}.pdf`;
        const outputPath = path.join('temp', outputFilename);
        
        await fs.writeFile(outputPath, composedPdfBytes);
        
        res.json({
            success: true,
            downloadUrl: `/api/download/${outputFilename}`,
            filename: outputFilename
        });
    } catch (error) {
        console.error('Compose error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Download composed PDF endpoint
app.get('/api/download/:filename', async (req, res) => {
    try {
        const filePath = path.join('temp', req.params.filename);
        const exists = await fs.access(filePath).then(() => true).catch(() => false);
        
        if (!exists) {
            return res.status(404).json({ error: 'File not found' });
        }

        res.download(filePath, req.params.filename, (err) => {
            if (err) {
                console.error('Download error:', err);
                res.status(500).json({ error: 'Download failed' });
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large' });
        }
    }
    
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const startServer = async () => {
    await initDirectories();
    
    app.listen(PORT, () => {
        console.log(`PDF Composer Web Server running on port ${PORT}`);
        console.log(`Access the application at http://localhost:${PORT}`);
    });
};

startServer().catch(console.error);