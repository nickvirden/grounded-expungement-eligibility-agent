/**
 * Rejects cross-site requests to a server-to-server proxy route.
 *
 * Route Handlers that relay to the FastAPI backend synthesize their own
 * CSRF pair (see api/chat/route.ts, api/backend/[...path]/route.ts) because
 * a server-to-server call has no browser context to issue a real
 * double-submit token from. That pair always matches, by construction --
 * which means it always satisfies FastAPI's CSRF check, for ANY caller, not
 * just this app's own frontend. Without an origin check here, these routes
 * become an open proxy: any third-party site's page can POST directly to
 * them and have the request forwarded with manufactured credentials that
 * bypass the exact protection the double-submit pattern exists to provide.
 *
 * Browsers send an Origin header on every "unsafe" method (POST/PUT/PATCH/
 * DELETE) request, same-origin or not -- so comparing it against the
 * request's own Host is a reliable same-origin check that doesn't require
 * hardcoding this deployment's domain (which can vary across Vercel preview/
 * production aliases).
 */
export function isSameOriginRequest(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
