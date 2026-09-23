/**
 * POST /api/chat
 *
 * Creates a new agent intake on the FastAPI backend and returns the intake_id.
 * The client then opens a GET /api/chat/[intake_id]/stream connection to read the SSE stream.
 */
import { randomBytes } from 'node:crypto';
import { isSameOriginRequest } from '@/lib/checkSameOrigin';
import { NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:8000';

export async function POST(req: Request): Promise<Response> {
  // This route synthesizes a matching CSRF pair below, which always passes
  // FastAPI's double-submit check -- that's necessary since a server-to-
  // server call has no browser-issued token to relay, but it also means
  // this route itself must enforce same-origin, or any third-party site's
  // page can POST here directly and have the request forwarded with
  // credentials that bypass the exact protection this pattern provides.
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
  }

  let body: { state?: string; narrative?: string };

  try {
    body = (await req.json()) as { state?: string; narrative?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { state, narrative } = body;

  if (!state) {
    return NextResponse.json({ error: 'state is required' }, { status: 400 });
  }

  const csrfToken = randomBytes(32).toString('base64url');

  const intakeRes = await fetch(`${API_BASE}/api/intakes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `__Host-csrf=${csrfToken}`,
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({
      mode: 'agent',
      state,
      narrative_text: narrative ?? '',
    }),
  });

  if (!intakeRes.ok) {
    const text = await intakeRes.text();
    console.error('FastAPI intake create failed', intakeRes.status, text);
    // 429 (rate limit) and 503 (agent chat unavailable, e.g. no signing
    // key configured) are real, distinct failure modes the client should
    // see and react to differently -- collapsing them into a generic 502
    // would hide that from the chat UI.
    const status = intakeRes.status === 429 || intakeRes.status === 503 ? intakeRes.status : 502;
    return NextResponse.json({ error: 'Failed to create intake' }, { status });
  }

  const data = (await intakeRes.json()) as {
    intake_id: string;
    status: string;
    stream_token?: string | null;
  };
  return NextResponse.json({ intake_id: data.intake_id, stream_token: data.stream_token ?? null });
}
