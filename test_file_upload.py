#!/usr/bin/env python3
"""
Test script for file upload workflow functionality
"""

import asyncio
import base64
from pathlib import Path
import tempfile

from src.file_upload_workflow import FileUploadWorkflow
from src.settings import init_settings


async def test_file_upload():
    """Test the file upload workflow with a sample file"""

    print("🧪 Testing File Upload Workflow")
    print("=" * 50)

    # Initialize settings
    init_settings()

    # Create a sample text file for testing
    sample_content = """
# Sample Document

This is a test document for the RHOAI AI Feature Sizing file upload functionality.

## Features to Test:
- Document processing with LlamaIndex
- Text extraction and chunking
- Vector embedding creation
- Knowledge base integration

## Technical Requirements:
- PDF, DOCX, TXT, and MD file support
- Automatic metadata extraction
- RAG pipeline integration
- Progress tracking and error handling

This document should be processed and indexed for retrieval-augmented generation.
"""

    # Create temporary file
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write(sample_content)
        temp_file_path = f.name

    try:
        # Read the file and encode to base64
        with open(temp_file_path, "rb") as f:
            file_content = f.read()

        file_b64 = base64.b64encode(file_content).decode("utf-8")

        print(f"📁 Created test file: {Path(temp_file_path).name}")
        print(f"📊 File size: {len(file_content)} bytes")

        # Create workflow instance
        workflow = FileUploadWorkflow()
        print("✅ Workflow initialized")

        # Test the workflow
        print("\n🚀 Starting file upload workflow...")

        # Simulate the workflow run
        start_event_data = {
            "files": [{"filename": "test_document.txt", "content": file_b64}],
            "user_id": "test_user",
            "context_description": "Test document for RHOAI file upload feature",
        }

        # Run the workflow
        from llama_index.core.workflow import StartEvent

        start_event = StartEvent(**start_event_data)

        print("   Processing files...")
        handler = await workflow.run(start_event)

        print("   Collecting results...")
        result = None
        async for event in handler.collect():
            if hasattr(event, "type"):
                print(f"📡 Event: {event.type}")
                if hasattr(event, "data") and hasattr(event.data, "stage"):
                    print(f"   Stage: {event.data.stage} ({event.data.progress}%)")
                    print(f"   Message: {event.data.message}")
            else:
                # Final result from StopEvent
                result = event
                if isinstance(result, dict):
                    print(f"\n✅ Workflow completed!")
                    print(f"   Success: {result.get('success', 'Unknown')}")
                    print(f"   Message: {result.get('message', 'No message')}")
                    print(f"   Files processed: {result.get('files_processed', 0)}")
                    print(f"   Documents created: {result.get('documents_created', 0)}")

                    if result.get("knowledge_base_name"):
                        print(f"   Knowledge base: {result['knowledge_base_name']}")

                    if result.get("errors"):
                        print(f"   Errors: {result['errors']}")
                break

        if result and result.get("success"):
            print("\n🎉 File upload workflow test PASSED!")
            print("\nNext steps:")
            print("1. Start the LlamaDeploy services")
            print("2. Test file upload via the UI")
            print("3. Verify knowledge base creation")
        else:
            print("\n❌ File upload workflow test FAILED!")
            if result:
                print(f"Error: {result.get('message', 'Unknown error')}")

    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback

        traceback.print_exc()

    finally:
        # Cleanup
        Path(temp_file_path).unlink(missing_ok=True)
        print(f"\n🧹 Cleaned up test file")


if __name__ == "__main__":
    asyncio.run(test_file_upload())
