import { BACKEND_URL } from '@/lib/config';

// GET /api/rfe-workflows - List all RFE workflows
export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/rfe-workflows`);
    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }
    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('Error fetching RFE workflows:', error);
    return Response.json({ error: 'Failed to fetch RFE workflows' }, { status: 500 });
  }
}

// POST /api/rfe-workflows - Create a new RFE workflow
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await fetch(`${BACKEND_URL}/rfe-workflows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      return Response.json(errorData, { status: response.status });
    }

    const data = await response.json();
    return Response.json(data, { status: 201 });
  } catch (error) {
    console.error('Error creating RFE workflow:', error);
    return Response.json({ error: 'Failed to create RFE workflow' }, { status: 500 });
  }
}