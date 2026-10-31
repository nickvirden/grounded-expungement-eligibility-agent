/**
 * /api/[...path]
 *
 * Catch-all for /api/* requests no other route handles, so they answer with
 * JSON instead of the HTML not-found page. That page renders unstyled under
 * the `default-src 'none'` CSP that /api/* responses carry, and API clients
 * expect a JSON body. More specific routes (api/backend, api/chat) take
 * precedence over this one.
 *
 * The handler reads nothing from the request and forwards nothing, so it is
 * safe for every method without a same-origin check, and it never echoes the
 * path. OPTIONS is exported explicitly because Next otherwise answers it
 * with an empty 204, which would read as a successful route. HEAD is not
 * exported: Next derives it from GET.
 */
function notFound(): Response {
  return Response.json(
    { detail: 'Not Found' },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
}

export {
  notFound as GET,
  notFound as POST,
  notFound as PUT,
  notFound as PATCH,
  notFound as DELETE,
  notFound as OPTIONS,
};
