import { BACKEND_URL } from '@/lib/config';

type RouteContext = {
  params: Promise<{ id: string; path: string[] }>;
};

// GET /api/rfe-workflows/[id]/artifacts/[...path] - Get artifact content
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { id, path } = await params;
    const artifactPath = path.join('/');

    const response = await fetch(`${BACKEND_URL}/rfe-workflows/${id}/artifacts/${encodeURIComponent(artifactPath)}`);

    if (!response.ok) {
      if (response.status === 404) {
        return Response.json({ error: 'Workflow or artifact not found' }, { status: 404 });
      }
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    // Return the content with the same content type as the backend
    const contentType = response.headers.get('content-type') || 'text/plain';
    const content = await response.text();

    return new Response(content, {
      headers: {
        'Content-Type': contentType,
      },
    });
  } catch (error) {
    console.error('Error fetching RFE workflow artifact:', error);
    return Response.json({ error: 'Failed to fetch RFE workflow artifact' }, { status: 500 });
  }
}

// PUT /api/rfe-workflows/[id]/artifacts/[...path] - Update artifact content
export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const { id, path } = await params;
    const artifactPath = path.join('/');
    const content = await request.text();

    const response = await fetch(`${BACKEND_URL}/rfe-workflows/${id}/artifacts/${encodeURIComponent(artifactPath)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: content,
    });

    if (!response.ok) {
      if (response.status === 404) {
        return Response.json({ error: 'Workflow not found' }, { status: 404 });
      }
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      return Response.json(errorData, { status: response.status });
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('Error updating RFE workflow artifact:', error);
    return Response.json({ error: 'Failed to update RFE workflow artifact' }, { status: 500 });
  }
}