# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PDFW is a web-based PDF composition application that allows users to upload PDFs, select specific pages as citations and covers, then compose them into new PDF documents. This replicates the functionality of a Swift macOS app in a web environment.

## Development Commands

```bash
# Development server with auto-reload
npm run dev

# Production server
npm start

# Run tests (Jest configured, no tests written yet)
npm test
```

The application runs on port 3000 by default (configurable via PORT environment variable).

## Architecture

**Backend (server.js):**
- `PDFService` class: Handles PDF loading, validation, and thumbnail generation with caching
- `Composer` class: Manages PDF merging and composition operations using pdf-lib
- Express REST API with file upload handling (50MB limit)

**Frontend (public/app.js - ~2200 lines):**
- `PDFComposerApp` class: Main application controller managing the entire user workflow
- PDF rendering using PDF.js for client-side processing
- Complex cover positioning system with drag/drop and resize capabilities
- Interactive thumbnail selection with visual indicators (○/✓ for citations, ☆/★ for covers)

**File Processing Flow:**
1. Upload → PDF validation → Memory-efficient parsing
2. Thumbnail generation (limited to 100 pages max)
3. Client-side rendering and user selection
4. Server-side composition with pdf-lib
5. Export in multiple formats (PDF, PNG, JPEG)

## Key Implementation Details

**Security:** Files are validated as PDFs only, with Helmet and CORS protection. All uploads are temporary with automatic cleanup.

**Memory Management:** Large PDFs are processed efficiently using streaming and limited thumbnail generation to prevent memory issues.

**Cover Positioning:** Advanced transformation system allows interactive positioning with boundary constraints and real-time preview updates.

**Selection System:** Multi-select for citation pages and single-select for cover pages, with comprehensive state management across the application lifecycle.

## API Endpoints

- `POST /api/upload` - Upload and validate PDF files
- `GET /api/pdf/:fileId/info` - Retrieve PDF metadata and page count
- `GET /api/pdf/:fileId/thumbnails` - Generate and cache page thumbnails
- `POST /api/compose` - Compose selected pages into new PDF
- `GET /api/download/:filename` - Download composed output
- `GET /api/health` - Server health check

## File Structure

```
├── server.js              # Express server and PDF processing logic
├── public/
│   ├── index.html        # Single-page application UI
│   ├── styles.css        # Complete styling system
│   └── app.js            # Frontend application logic (~2200 lines)
├── uploads/              # Temporary uploaded PDF files
├── temp/                 # Temporary composed output files
└── temp_preview_method.js # Alternative preview implementation
```

## Git Workflow

**IMPORTANT:** Never commit directly to main/master branch. Always use feature branches:

1. Create a new feature branch for any code changes
2. Make commits and push to the feature branch
3. Wait for explicit approval before merging into main
4. Only merge when given the green light

```bash
# Example workflow
git checkout -b feature/your-feature-name
# Make changes
git add .
git commit -m "Your changes"
git push -u origin feature/your-feature-name
# Wait for approval before merging
```

## Development Notes

The application is in Phase 1 (core functionality complete). Phase 2 will focus on implementing a brutalist design aesthetic as mentioned in the README.

The codebase includes sophisticated client-side PDF processing to minimize server load. The main complexity lies in the frontend application logic, particularly the cover transformation and selection management systems.

No database is used - all operations work with temporary filesystem storage with automatic cleanup.