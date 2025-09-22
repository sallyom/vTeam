import { BACKEND_URL } from '@/lib/config'
import { buildForwardHeadersAsync } from '@/lib/auth'

// GET /api/projects/[name]/agents/[persona]/markdown - Fetch agent markdown
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string; persona: string }> },
) {
  try {
    const { name, persona } = await params
    const headers = await buildForwardHeadersAsync(request)
    const resp = await fetch(`${BACKEND_URL}/projects/${encodeURIComponent(name)}/agents/${encodeURIComponent(persona)}/markdown`, { headers })
    const text = await resp.text()
    // Markdown; backend likely sets text/markdown, but ensure passthrough if absent
    const contentType = resp.headers.get('Content-Type') || 'text/markdown; charset=utf-8'
    return new Response(text, { status: resp.status, headers: { 'Content-Type': contentType } })
  } catch (error) {
    console.error('Error fetching agent markdown:', error)
    return new Response('# Error fetching agent markdown', { status: 500, headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
  }
}


