/**
 * GET /api/chat/[intake_id]/stream
 *
 * Proxies the FastAPI SSE stream for a given intake to the browser. The
 * client connects via ReadableStream (see useChatStream), not EventSource,
 * specifically so it can send the stream token as an Authorization header
 * rather than a query param -- EventSource has no way to set headers, and a
 * token in the URL would leak into logs and any Referer header.
 */

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:8000';

// The API's own real statuses for this route -- anything else upstream
// returns is an unexpected failure, reported as a generic 502 rather than
// leaking an arbitrary upstream status straight through.
const FORWARDED_STATUSES = new Set([401, 403, 404, 409, 429, 503]);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ intake_id: string }> },
): Promise<Response> {
  const { intake_id } = await params;

  // Forwarded as-is, present or not: the API is the source of truth for
  // whether a token is required (it's 503, not 401, when SSE_SIGNING_KEY
  // itself isn't configured), so this proxy doesn't try to replicate that
  // decision locally -- it also means an older API that doesn't require a
  // token yet keeps working during a deploy where only the web side has
  // rolled out this header.
  const authHeader = req.headers.get('authorization');

  const upstream = await fetch(`${API_BASE}/api/intakes/${encodeURIComponent(intake_id)}/stream`, {
    headers: {
      Accept: 'text/event-stream',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
  });

  if (!upstream.ok || !upstream.body) {
    const status = FORWARDED_STATUSES.has(upstream.status) ? upstream.status : 502;
    const wwwAuthenticate = upstream.headers.get('www-authenticate');
    return new Response('Stream unavailable', {
      status,
      headers: wwwAuthenticate ? { 'WWW-Authenticate': wwwAuthenticate } : undefined,
    });
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
