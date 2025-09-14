import { BACKEND_URL } from '@/lib/config';

// GET /api/agentic-sessions - List all agentic sessions
export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/agentic-sessions`);
    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }
    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('Error fetching agentic sessions:', error);
    return Response.json({ error: 'Failed to fetch agentic sessions' }, { status: 500 });
  }
}

// POST /api/agentic-sessions - Create a new agentic session
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await fetch(`${BACKEND_URL}/agentic-sessions`, {
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
    console.error('Error creating agentic session:', error);
    return Response.json({ error: 'Failed to create agentic session' }, { status: 500 });
  }
}
