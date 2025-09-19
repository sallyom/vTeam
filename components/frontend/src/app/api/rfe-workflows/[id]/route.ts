import { BACKEND_URL } from '@/lib/config';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET /api/rfe-workflows/[id] - Get specific RFE workflow
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const response = await fetch(`${BACKEND_URL}/rfe-workflows/${id}`);

    if (!response.ok) {
      if (response.status === 404) {
        return Response.json({ error: 'Workflow not found' }, { status: 404 });
      }
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('Error fetching RFE workflow:', error);
    return Response.json({ error: 'Failed to fetch RFE workflow' }, { status: 500 });
  }
}

// DELETE /api/rfe-workflows/[id] - Delete RFE workflow
export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const response = await fetch(`${BACKEND_URL}/rfe-workflows/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      if (response.status === 404) {
        return Response.json({ error: 'Workflow not found' }, { status: 404 });
      }
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('Error deleting RFE workflow:', error);
    return Response.json({ error: 'Failed to delete RFE workflow' }, { status: 500 });
  }
}