import { BACKEND_URL } from '@/lib/config'
import { buildForwardHeadersAsync } from '@/lib/auth'

// GET /api/projects/[name]/agents - List agents for a project
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params
    const headers = await buildForwardHeadersAsync(request)
    const resp = await fetch(`${BACKEND_URL}/projects/${encodeURIComponent(name)}/agents`, { headers })
    const data = await resp.text()
    return new Response(data, { status: resp.status, headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('Error listing agents:', error)
    return Response.json({ error: 'Failed to list agents' }, { status: 500 })
  }
}


