import { BACKEND_URL } from '@/lib/config';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// POST /api/rfe-workflows/[id]/advance-phase - Advance RFE workflow to next phase
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const response = await fetch(`${BACKEND_URL}/rfe-workflows/${id}/advance-phase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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
    console.error('Error advancing RFE workflow phase:', error);
    return Response.json({ error: 'Failed to advance RFE workflow phase' }, { status: 500 });
  }
}