/**
 * GET /api/chat/[intake_id]/stream
 *
 * Proxies the FastAPI SSE stream for a given intake to the browser.
 * The client connects via EventSource or ReadableStream.
 */

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:8000';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ intake_id: string }> },
): Promise<Response> {
  const { intake_id } = await params;

  const upstream = await fetch(`${API_BASE}/api/intakes/${intake_id}/stream`, {
    headers: { Accept: 'text/event-stream' },
  });

  if (!upstream.ok || !upstream.body) {
    return new Response('Stream unavailable', { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}
