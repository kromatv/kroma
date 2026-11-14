/** `value` when it is a path inside this site that is safe to send a person
 * to after signing in. A backslash counts as a slash to the URL parser
 * (`/\evil.com` resolves to `https://evil.com/`), so the second character is
 * refused either way, and the pages that only exist to sign someone in are
 * dropped so arriving there cannot loop. */
export function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/')) return undefined;
  if (value[1] === '/' || value[1] === '\\') return undefined;
  return value.startsWith('/login') || value.startsWith('/sso') ? undefined : value;
}
