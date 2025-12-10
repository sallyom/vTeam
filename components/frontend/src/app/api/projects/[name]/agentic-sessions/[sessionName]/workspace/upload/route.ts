import { buildForwardHeadersAsync } from '@/lib/auth';
import { BACKEND_URL } from '@/lib/config';
import { NextRequest } from 'next/server';

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

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

      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        return new Response(
          JSON.stringify({
            error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`
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

      // Check file size
      if (fileBuffer.byteLength > MAX_FILE_SIZE) {
        return new Response(
          JSON.stringify({
            error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`
          }),
          {
            status: 413, // Payload Too Large
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const contentType = fileResp.headers.get('content-type') || 'application/octet-stream';

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
