# PDF Composer Web

A web-based version of the PDF composer application that replicates the core functionality of the Swift macOS app.

## Core Features Implemented ✅

### Phase 1: Core Functions (Complete)

1. **PDF Upload & Processing**
   - File upload with drag & drop support
   - PDF parsing and page extraction
   - Memory-efficient processing (50MB limit)
   - Security validation

2. **PDF Preview & Navigation**
   - Full-screen PDF viewer with zoom
   - Thumbnail sidebar with page overview
   - Keyboard navigation (arrow keys)
   - Page jump functionality

3. **Page Selection System**
   - Citation page selection (multi-select)
   - Cover page selection (single select)
   - Visual selection indicators
   - Real-time selection summary

4. **PDF Composition**
   - Merge selected pages into new document
   - Cover page placement options (top/center/bottom)
   - Memory-efficient composition
   - Export to PDF format

5. **User Interface**
   - Responsive design matching app functionality
   - Loading states with progress indicators
   - Toast notifications for user feedback
   - Error handling and validation

## Technology Stack

- **Backend**: Node.js + Express
- **PDF Processing**: PDF-lib, pdf2pic, Sharp
- **Frontend**: Vanilla JavaScript + PDF.js
- **Security**: Helmet, CORS, file validation
- **File Handling**: Multer for uploads

## Installation & Setup

```bash
# Navigate to project directory
cd /Users/droy-/Desktop/PDFW

# Install dependencies
npm install

# Start development server
npm run dev

# Or start production server
npm start
```

## Usage

1. **Upload PDF**: Click "OPEN PDF" or drag & drop a PDF file
2. **Select Pages**: Use thumbnail sidebar to select citation pages (○/✓) and cover page (☆/★)
3. **Compose**: Click "APPLY SELECTION" when ready
4. **Export**: Choose cover placement and export format, then click "COMPOSE PDF"
5. **Download**: Composed PDF downloads automatically

## API Endpoints

- `POST /api/upload` - Upload PDF file
- `GET /api/pdf/:fileId/info` - Get PDF information
- `GET /api/pdf/:fileId/thumbnails` - Generate thumbnails
- `POST /api/compose` - Compose selected pages
- `GET /api/download/:filename` - Download composed PDF

## File Structure

```
PDFW/
├── server.js           # Express server & API endpoints
├── package.json        # Dependencies & scripts
├── public/
│   ├── index.html     # Main application UI
│   ├── styles.css     # Styling (functional, non-brutalist)
│   └── app.js         # Frontend JavaScript logic
├── uploads/           # Temporary uploaded files
└── temp/             # Temporary composed files
```

## Swift App Equivalents

| Swift Component | Web Implementation |
|---|---|
| `PDFService.swift` | `PDFService` class in server.js |
| `Composer.swift` | `Composer` class in server.js |
| `BrutalistAppShell.swift` | Main UI in index.html + app.js |
| `ThumbnailCache.swift` | Browser-based caching in app.js |
| `PageSelectionView.swift` | Selection UI in frontend |

## Next Steps: Phase 2 (Design)

Once core functionality is verified:
- Implement brutalist design aesthetic
- Add noise textures and visual effects
- Enhanced typography and spacing
- Custom animations and transitions
- Design system consistency

## Performance Notes

- 50MB file size limit for uploads
- Thumbnail generation limited to 100 pages
- Memory-efficient PDF processing
- Client-side PDF rendering with PDF.js
- Automatic cleanup of temporary files