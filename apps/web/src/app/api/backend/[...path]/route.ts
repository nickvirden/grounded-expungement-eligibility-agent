/**
 * /api/backend/[...path]
 *
 * Server-to-server proxy to the FastAPI backend for every non-streaming API
 * call the browser makes (states, eligibility assessment, intake CRUD). The
 * browser only ever talks to this same-origin route; this handler is the one
 * that actually reaches INTERNAL_API_URL, which may be cross-origin from the
 * deployed frontend (e.g. two separate Vercel projects).
 *
 * This exists because the double-submit CSRF cookie pattern requires the
 * cookie to be readable via document.cookie, which only works same-origin --
 * a cookie set by a cross-origin API response is stored by the browser and
 * still sent automatically on future requests to that origin, but is
 * invisible to JS running on a different origin's page. Proxying through a
 * same-origin route sidesteps this entirely: the browser only ever sees
 * responses (and any Set-Cookie) as coming from its own origin.
 *
 * Uses the same synthesized-CSRF-pair pattern as api/chat/route.ts: a
 * server-to-server call has no browser context, so a freshly generated
 * matching cookie+header pair satisfies the double-submit contract without
 * needing a real browser-issued token. That pair always matches -- so this
 * route must enforce same-origin itself (see checkSameOrigin.ts) for
 * mutating requests, or it becomes an open proxy that forwards any
 * third-party site's request with credentials that always pass downstream.
 */
import { randomBytes } from 'node:crypto';
import { isSameOriginRequest } from '@/lib/checkSameOrigin';
import { NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:8000';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function proxy(req: Request, path: string[]): Promise<Response> {
  const method = req.method.toUpperCase();

  if (MUTATING_METHODS.has(method) && !isSameOriginRequest(req)) {
    return NextResponse.json({ detail: 'Origin not allowed' }, { status: 403 });
  }

  const search = new URL(req.url).search;
  // lib/api.ts's paths already start with "api" (e.g. "/api/eligibility/assess"),
  // which [...path] captures as part of this segment -- don't prepend another one.
  const upstreamUrl = `${API_BASE}/${path.join('/')}${search}`;

  const headers = new Headers({ 'Content-Type': 'application/json' });

  if (MUTATING_METHODS.has(method)) {
    const csrfToken = randomBytes(32).toString('base64url');
    headers.set('Cookie', `__Host-csrf=${csrfToken}`);
    headers.set('X-CSRF-Token', csrfToken);
  }

  const hasBody = method !== 'GET' && method !== 'DELETE';
  const upstream = await fetch(upstreamUrl, {
    method,
    headers,
    body: hasBody ? await req.text() : undefined,
  });

  const responseBody = await upstream.text();
  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
    },
  });
}

type RouteParams = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, { params }: RouteParams): Promise<Response> {
  const { path } = await params;
  return proxy(req, path);
}

export async function POST(req: Request, { params }: RouteParams): Promise<Response> {
  const { path } = await params;
  return proxy(req, path);
}

export async function DELETE(req: Request, { params }: RouteParams): Promise<Response> {
  const { path } = await params;
  return proxy(req, path);
}
