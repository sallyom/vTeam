import { BACKEND_URL } from '@/lib/config'
import { buildForwardHeadersAsync } from '@/lib/auth'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string; id: string }> },
) {
  const { name, id } = await params
  const headers = await buildForwardHeadersAsync(request)
  const resp = await fetch(`${BACKEND_URL}/projects/${encodeURIComponent(name)}/bugfix-workflows/${encodeURIComponent(id)}/sessions`, { headers })
  const data = await resp.text()
  return new Response(data, { status: resp.status, headers: { 'Content-Type': 'application/json' } })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string; id: string }> },
) {
  const { name, id } = await params
  const headers = await buildForwardHeadersAsync(request)
  const body = await request.text()
  const resp = await fetch(`${BACKEND_URL}/projects/${encodeURIComponent(name)}/bugfix-workflows/${encodeURIComponent(id)}/sessions`, {
    method: 'POST',
    headers,
    body,
  })
  const data = await resp.text()
  return new Response(data, { status: resp.status, headers: { 'Content-Type': 'application/json' } })
}
