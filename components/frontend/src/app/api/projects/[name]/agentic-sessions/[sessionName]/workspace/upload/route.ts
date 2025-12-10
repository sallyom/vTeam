import { buildForwardHeadersAsync } from '@/lib/auth';
import { BACKEND_URL } from '@/lib/config';
import { NextRequest } from 'next/server';

// Maximum file sizes based on type
const MAX_DOCUMENT_SIZE = 8 * 1024 * 1024; // 8MB for documents
const MAX_IMAGE_SIZE = 1 * 1024 * 1024; // 1MB for images

// Determine if a file is an image based on content type
const isImageFile = (contentType: string): boolean => {
  return contentType.startsWith('image/');
};

// Get the appropriate max file size based on content type
const getMaxFileSize = (contentType: string): number => {
  return isImageFile(contentType) ? MAX_IMAGE_SIZE : MAX_DOCUMENT_SIZE;
};

// Format size limit for error messages
const formatSizeLimit = (contentType: string): string => {
  const sizeInMB = getMaxFileSize(contentType) / (1024 * 1024);
  const fileType = isImageFile(contentType) ? 'images' : 'documents';
  return `${sizeInMB}MB for ${fileType}`;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string; sessionName: string }> },
) {
  const { name, sessionName } = await params;
  const headers = await buildForwardHeadersAsync(request);

  try {
    const formData = await request.formData();
    const uploadType = formData.get('type') as string;

    if (uploadType === 'local') {
      // Handle local file upload
      const file = formData.get('file') as File;
      if (!file) {
        return new Response(JSON.stringify({ error: 'No file provided' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const filename = (formData.get('filename') as string) || file.name;
      const contentType = file.type || 'application/octet-stream';

      // Check file size based on type
      const maxSize = getMaxFileSize(contentType);
      if (file.size > maxSize) {
        return new Response(
          JSON.stringify({
            error: `File too large. Maximum size is ${formatSizeLimit(contentType)}`
          }),
          {
            status: 413, // Payload Too Large
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const fileBuffer = await file.arrayBuffer();

      // Upload to workspace/file-uploads directory using the PUT endpoint
      // Retry logic: if backend returns 202 (content service starting), retry up to 3 times
      let resp: Response | null = null;
      let retries = 0;
      const maxRetries = 3;
      const retryDelay = 2000; // 2 seconds

      while (retries <= maxRetries) {
        resp = await fetch(
          `${BACKEND_URL}/projects/${encodeURIComponent(name)}/agentic-sessions/${encodeURIComponent(sessionName)}/workspace/file-uploads/${encodeURIComponent(filename)}`,
          {
            method: 'PUT',
            headers: {
              ...headers,
              'Content-Type': file.type || 'application/octet-stream',
            },
            body: fileBuffer,
          },
        );

        // If 202 Accepted (content service starting), wait and retry
        if (resp.status === 202 && retries < maxRetries) {
          retries++;
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          continue;
        }

        break;
      }

      if (!resp) {
        return new Response(JSON.stringify({ error: 'Upload failed - no response from server' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (!resp.ok) {
        const errorText = await resp.text();
        return new Response(JSON.stringify({ error: 'Failed to upload file', details: errorText }), {
          status: resp.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, filename }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (uploadType === 'url') {
      // Handle URL-based file upload
      const fileUrl = formData.get('url') as string;
      const filename = formData.get('filename') as string;

      if (!fileUrl || !filename) {
        return new Response(JSON.stringify({ error: 'URL and filename are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Download the file from URL
      const fileResp = await fetch(fileUrl);
      if (!fileResp.ok) {
        return new Response(JSON.stringify({ error: 'Failed to download file from URL' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const fileBuffer = await fileResp.arrayBuffer();
      const contentType = fileResp.headers.get('content-type') || 'application/octet-stream';

      // Check file size based on type
      const maxSize = getMaxFileSize(contentType);
      if (fileBuffer.byteLength > maxSize) {
        return new Response(
          JSON.stringify({
            error: `File too large. Maximum size is ${formatSizeLimit(contentType)}`
          }),
          {
            status: 413, // Payload Too Large
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Upload to workspace/file-uploads directory using the PUT endpoint
      // Retry logic: if backend returns 202 (content service starting), retry up to 3 times
      let resp: Response | null = null;
      let retries = 0;
      const maxRetries = 3;
      const retryDelay = 2000; // 2 seconds

      while (retries <= maxRetries) {
        resp = await fetch(
          `${BACKEND_URL}/projects/${encodeURIComponent(name)}/agentic-sessions/${encodeURIComponent(sessionName)}/workspace/file-uploads/${encodeURIComponent(filename)}`,
          {
            method: 'PUT',
            headers: {
              ...headers,
              'Content-Type': contentType,
            },
            body: fileBuffer,
          },
        );

        // If 202 Accepted (content service starting), wait and retry
        if (resp.status === 202 && retries < maxRetries) {
          retries++;
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          continue;
        }

        break;
      }

      if (!resp) {
        return new Response(JSON.stringify({ error: 'Upload failed - no response from server' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (!resp.ok) {
        const errorText = await resp.text();
        return new Response(JSON.stringify({ error: 'Failed to upload file', details: errorText }), {
          status: resp.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, filename }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({ error: 'Invalid upload type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('File upload error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
