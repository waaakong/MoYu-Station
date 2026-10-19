/** The packaged renderer is loaded from file:// (an opaque/null origin).
 * Enables anonymous Web Audio reads inside the default app session only.
 * Opaque media tokens remain the authority; no cookies, wildcard origins,
 * upstream CORS headers or credentialed reads are exposed here.
 */
export function audioCorsHeaders(request: Request): Record<string, string> {
  return request.headers.get("origin") === "null"
    ? { "Access-Control-Allow-Origin": "null", "Vary": "Origin" }
    : {};
}
