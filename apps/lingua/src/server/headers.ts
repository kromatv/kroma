const HEADERS = {
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
} as const;

/**
 * `response` with the headers every answer of this Worker carries: no other
 * site frames it, so nobody is tricked into pressing Send through one; a
 * browser does not guess a content type; and it comes back over HTTPS.
 */
export function hardened(response: Response): Response {
  const answer = new Response(response.body, response);
  for (const [name, value] of Object.entries(HEADERS)) {
    answer.headers.set(name, value);
  }
  return answer;
}
