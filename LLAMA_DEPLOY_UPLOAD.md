# File Upload with LlamaDeploy

This guide explains how to use the file upload functionality integrated with your existing LlamaDeploy setup.

## ✅ What's Now Integrated

The file upload functionality is now deployed as a **workflow service** alongside your existing services:

- **RFE Builder Workflow** - Your main RFE building process
- **Artifact Editor Workflow** - Document editing functionality  
- **File Upload Workflow** ← **NEW!** - Handles file uploads and RAG integration
- **Chat UI** - Your frontend interface

## 🚀 How to Deploy

### 1. Deploy with LlamaDeploy

```bash
# Deploy all services including file upload
llamactl deploy deployment.yml
```

This starts:
- Control plane on port **4501**
- UI on port **3000** 
- All workflow services including file upload

### 2. Access the Services

**Control Plane:** `http://localhost:4501`
**Chat UI:** `http://localhost:3000`
**File Upload Workflow:** `http://localhost:4501/file-upload-workflow`

## 📡 How It Works

### Workflow Integration Flow

```
User uploads files in UI
         ↓
Frontend converts files to base64
         ↓
POST to http://localhost:4501/file-upload-workflow/run
         ↓
LlamaDeploy routes to File Upload Workflow
         ↓
Workflow processes files with LlamaIndex
         ↓
Creates knowledge base for RAG
         ↓
Returns success/progress to UI
```

### API Call Format

The UI makes requests like this:

```javascript
fetch("http://localhost:4501/file-upload-workflow/run", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    files: [
      {
        filename: "document.pdf",
        content: "base64-encoded-content-here"
      }
    ],
    user_id: "user123",
    context_description: "Technical specifications"
  })
});
```

### Response Format

```json
{
  "success": true,
  "message": "Successfully processed 2 files into 15 documents",
  "files_processed": 2,
  "documents_created": 15,
  "knowledge_base_name": "uploads_user123_20241212_143022",
  "errors": []
}
```

## 🔧 Configuration

### Workflow Service Configuration

In `deployment.yml`:

```yaml
file-upload-workflow:
  name: File Upload Workflow
  source:
    type: local
    name: src
  path: src/file_upload_workflow:file_upload_workflow
  python-dependencies:
    - llama-index-llms-openai>=0.3.2
    - llama-index-core>=0.12.0
    - llama-index-readers-file>=0.4.6
    - python-multipart>=0.0.6
    - pyyaml>=6.0
```

### File Processing Settings

The workflow automatically:
- Validates file types (PDF, DOCX, TXT, MD, RTF)
- Limits file size (10MB per file)
- Creates temporary storage in `uploads/workflow_temp/`
- Processes with existing LlamaIndex readers
- Creates vector indexes for RAG integration

## 📊 Progress Tracking

The workflow emits progress events:

1. **validation** (10%) - Validating uploaded files
2. **processing** (30%) - Processing with LlamaIndex  
3. **completing** (90%) - Creating knowledge base
4. **completed** (100%) - Upload successful

## 🔍 Available Endpoints

Via LlamaDeploy control plane (`http://localhost:4501`):

### Run File Upload
```
POST /file-upload-workflow/run
```

### Get Workflow Status  
```
GET /file-upload-workflow/status
```

### List All Services
```
GET /services
```

## 🆚 Advantages vs Separate FastAPI

**With LlamaDeploy Integration:**
- ✅ Single deployment (`llamactl deploy`)
- ✅ Unified service discovery
- ✅ Progress streaming built-in
- ✅ Consistent with existing architecture
- ✅ Automatic load balancing
- ✅ Health monitoring included

**Previous FastAPI Approach:**
- ❌ Required separate server process
- ❌ Manual CORS configuration
- ❌ Additional port management  
- ❌ Separate deployment steps

## 🧹 Cleanup

The old FastAPI files are no longer needed:
- `src/upload_api.py` - Can be removed
- `ui/api/upload.ts` - Can be removed  

The workflow handles everything through LlamaDeploy!

## 🚨 Troubleshooting

### Common Issues

**"Connection refused to port 4501"**
- Ensure `llamactl deploy deployment.yml` is running
- Check control plane status

**"Workflow not found"** 
- Verify `file-upload-workflow` is in your `deployment.yml`
- Restart deployment: `llamactl deploy deployment.yml`

**"File processing failed"**
- Check OpenAI API key is set: `OPENAI_API_KEY`
- Verify file format is supported
- Check file size limits (10MB max)

### Debug Mode

Enable verbose logging in the workflow:

```python
# In file_upload_workflow.py
self.upload_handler = FileUploadHandler(
    upload_dir=Path("uploads/workflow_temp"),
    verbose=True  # Enable debug output
)
```

## 🎯 Next Steps

1. **Deploy**: `llamactl deploy deployment.yml`
2. **Test**: Upload files via the UI at `localhost:3000`
3. **Monitor**: Check progress in the UI and logs
4. **Scale**: LlamaDeploy handles multiple concurrent uploads

Your file upload is now fully integrated with your LlamaDeploy infrastructure! 🎉
