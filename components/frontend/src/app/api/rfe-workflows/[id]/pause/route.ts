import { BACKEND_URL } from '@/lib/config';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// POST /api/rfe-workflows/[id]/pause - Pause RFE workflow
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const response = await fetch(`${BACKEND_URL}/rfe-workflows/${id}/pause`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
    console.error('Error pausing RFE workflow:', error);
    return Response.json({ error: 'Failed to pause RFE workflow' }, { status: 500 });
  }
}