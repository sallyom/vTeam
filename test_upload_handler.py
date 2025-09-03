#!/usr/bin/env python3
"""
Test script for file upload handler functionality
"""

import asyncio
import tempfile
from pathlib import Path

from src.file_upload_handler import FileUploadHandler
from src.settings import init_settings


async def test_file_upload_handler():
    """Test the file upload handler directly"""

    print("🧪 Testing File Upload Handler")
    print("=" * 50)

    # Initialize settings
    init_settings()

    # Create a sample text file for testing
    sample_content = """
# Sample Document for RHOAI

This is a test document for the RHOAI AI Feature Sizing file upload functionality.

## Key Features:
- Document processing with LlamaIndex
- Text extraction and chunking  
- Vector embedding creation
- Knowledge base integration for RAG

## Technical Requirements:
- Support for PDF, DOCX, TXT, and MD files
- Automatic metadata extraction
- Integration with existing RAG pipeline
- Progress tracking and error handling

This document will be processed and indexed for retrieval-augmented generation.
"""

    # Create temporary file
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write(sample_content)
        temp_file_path = f.name

    try:
        print(f"📁 Created test file: {Path(temp_file_path).name}")
        print(f"📊 File size: {len(sample_content)} bytes")

        # Create upload handler
        handler = FileUploadHandler()
        print("✅ Handler initialized")

        # Test file validation
        print("\n🔍 Testing file validation...")
        with open(temp_file_path, "rb") as f:
            file_content = f.read()

        validation = handler.validate_file("test.txt", len(file_content))
        print(
            f"   Validation result: {'✅ PASS' if validation['valid'] else '❌ FAIL'}"
        )

        if not validation["valid"]:
            print(f"   Error: {validation['error']}")
            return

        # Test file saving
        print("\n💾 Testing file saving...")
        save_result = await handler.save_uploaded_file(
            file_content, "test_document.txt", "test_user"
        )

        if save_result["valid"]:
            print("   ✅ File saved successfully")
            print(f"   Path: {save_result['file_path']}")
            saved_file_path = save_result["file_path"]
        else:
            print(f"   ❌ Save failed: {save_result['error']}")
            return

        # Test document processing
        print("\n📄 Testing document processing...")
        processing_result = await handler.process_uploaded_files(
            [saved_file_path], "Test document for RHOAI file upload"
        )

        if processing_result["success"]:
            print("   ✅ Document processing successful")
            print(f"   Documents created: {processing_result['total_documents']}")
            print(f"   Processed files: {len(processing_result['processed_files'])}")

            if processing_result["errors"]:
                print(f"   Warnings: {processing_result['errors']}")
        else:
            print(f"   ❌ Processing failed: {processing_result['error']}")
            return

        # Test knowledge base creation
        print("\n🧠 Testing knowledge base creation...")
        kb_result = await handler.create_knowledge_base(
            processing_result["documents"], "test_upload_kb"
        )

        if kb_result["success"]:
            print("   ✅ Knowledge base created successfully")
            print(f"   Name: {kb_result['knowledge_base_name']}")
            print(f"   Documents: {kb_result['document_count']}")
        else:
            print(f"   ❌ KB creation failed: {kb_result['error']}")
            return

        # Test full workflow
        print("\n🔄 Testing complete upload workflow...")
        workflow_result = await handler.process_upload_workflow(
            [("complete_test.txt", file_content)],
            "test_user",
            "Complete workflow test",
            create_kb=True,
        )

        if workflow_result["success"]:
            print("   ✅ Complete workflow successful!")
            print(f"   Message: {workflow_result['message']}")
            print(f"   Files processed: {workflow_result['saved_files']}")
            print(f"   Documents created: {workflow_result['processed_documents']}")

            if workflow_result.get("knowledge_base"):
                kb_info = workflow_result["knowledge_base"]
                print(f"   KB created: {kb_info.get('knowledge_base_name', 'Unknown')}")
        else:
            print(f"   ❌ Workflow failed: {workflow_result['error']}")
            return

        print("\n🎉 All tests PASSED!")
        print("\n📋 Summary:")
        print("   ✅ File validation")
        print("   ✅ File saving")
        print("   ✅ Document processing")
        print("   ✅ Knowledge base creation")
        print("   ✅ Complete workflow")

        print("\n🚀 Ready for deployment!")
        print("   The file upload functionality is working correctly.")
        print("   You can now deploy with LlamaDeploy and test via the UI.")

    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback

        traceback.print_exc()

    finally:
        # Cleanup
        Path(temp_file_path).unlink(missing_ok=True)

        # Clean up saved files
        try:
            if "saved_file_path" in locals():
                Path(saved_file_path).unlink(missing_ok=True)
        except:
            pass

        print(f"\n🧹 Cleanup completed")


if __name__ == "__main__":
    asyncio.run(test_file_upload_handler())
