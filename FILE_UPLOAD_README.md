# File Upload Feature

This document explains how to use the newly added file upload functionality in the RHOAI AI Feature Sizing application.

## Overview

The file upload feature allows users to upload documents (PDF, DOCX, TXT, MD) that will be processed using LlamaIndex and integrated into the RAG (Retrieval-Augmented Generation) pipeline. This helps inform RFE creation with relevant context documents.

## Features

- **Drag & Drop Interface**: Users can drag files directly onto the upload area
- **Multiple File Support**: Upload up to 10 files at once (10MB max per file)
- **Document Processing**: Automatic text extraction and indexing using LlamaIndex
- **Knowledge Base Creation**: Creates searchable vector indexes from uploaded documents
- **Progress Tracking**: Real-time upload and processing progress indicators

## Supported File Formats

- PDF (`.pdf`)
- Microsoft Word (`.docx`, `.doc`)
- Text files (`.txt`)
- Markdown (`.md`)
- Rich Text Format (`.rtf`)

## Setup Instructions

### 1. Install Backend Dependencies

```bash
# Install Python dependencies
pip install -e .

# Or using uv (if available)
uv sync
```

### 2. Start the File Upload API Server

```bash
# Option 1: Using the project script
upload-server

# Option 2: Direct uvicorn command
uvicorn src.upload_api:app --host 0.0.0.0 --port 8001 --reload
```

### 3. Start the Frontend

```bash
cd ui
npm run dev
```

## Usage

### From the UI

1. **Access Upload Interface**: When no artifacts are present, click the "Upload Documents" button
2. **Upload Files**: Drag files onto the upload area or click "Choose Files"
3. **Processing**: Files are automatically processed and indexed
4. **Integration**: Uploaded content becomes available for RFE generation

### API Endpoints

The file upload functionality exposes several REST endpoints:

#### Upload Files
```http
POST /api/upload
Content-Type: multipart/form-data

files: [File]          # Required: Array of files to upload
user_id: string        # Optional: User identifier
context: string        # Optional: Context description
create_knowledge_base: boolean  # Optional: Create searchable index (default: true)
```

#### Check Upload Status
```http
GET /api/upload/status/{upload_id}
```

#### List Knowledge Bases
```http
GET /api/upload/knowledge-bases?user_id={user_id}
```

#### Cleanup Temporary Files
```http
DELETE /api/upload/cleanup?user_id={user_id}
```

## Configuration

### Environment Variables

- `OPENAI_API_KEY`: Required for LlamaIndex embeddings and LLM functionality
- `BACKEND_URL`: API base URL (default: `http://localhost:8000`)
- `PORT`: Upload server port (default: `8001`)

### File Upload Limits

- **Max file size**: 10MB per file
- **Max files per upload**: 10 files
- **Supported extensions**: `.pdf`, `.docx`, `.doc`, `.txt`, `.md`, `.rtf`

## Integration with RFE Builder

The uploaded documents are automatically integrated into the existing RFE building workflow:

1. **Document Processing**: Files are processed using LlamaIndex readers
2. **Vectorization**: Content is chunked and embedded for semantic search
3. **Knowledge Base**: A searchable vector index is created
4. **RAG Integration**: The knowledge base can be queried during RFE generation

## Architecture

```
Frontend (React)
    ↓ (File Upload)
API Endpoint (FastAPI)
    ↓ (Processing)
File Upload Handler
    ↓ (LlamaIndex Integration)
RAG Ingestion Pipeline
    ↓ (Storage)
Vector Index (Knowledge Base)
```

## File Processing Pipeline

1. **Validation**: Check file type and size limits
2. **Storage**: Save files to temporary directory
3. **Text Extraction**: Use LlamaIndex readers (PDFReader, DocxReader, etc.)
4. **Chunking**: Split text using SentenceSplitter
5. **Embedding**: Generate vector embeddings using OpenAI
6. **Indexing**: Create and persist vector store index
7. **Cleanup**: Remove temporary files

## Troubleshooting

### Common Issues

1. **"File type not supported"**: Ensure file has a supported extension
2. **"File size too large"**: Files must be under 10MB
3. **"Upload failed"**: Check that the backend server is running on port 8001
4. **"Processing failed"**: Verify OpenAI API key is set correctly

### Debug Mode

Enable verbose logging by setting the upload handler verbose flag:

```python
handler = FileUploadHandler(verbose=True)
```

### Logs

Check console output for detailed processing information and error messages.

## Future Enhancements

- **Asynchronous Processing**: Long-running uploads with progress webhooks
- **Cloud Storage**: Integration with S3/GCS for persistent file storage
- **OCR Support**: Text extraction from scanned documents
- **More File Formats**: Support for additional document types
- **Batch Processing**: Bulk upload and processing capabilities
