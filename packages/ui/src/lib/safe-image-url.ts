const IMAGE_SCHEME = /^(?:https?:|blob:|data:image\/)/i;

/** An artwork URL safe to hand to an `<img src>`, or null. Server-supplied
 * poster and backdrop URLs are third-party input; anything with a scheme must be
 * one that only ever paints (blocks `javascript:` and other DOM-sink schemes). */
export function safeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  // Tab and newline are deleted from ANYWHERE in a URL before it is parsed
  // (WHATWG URL, "URL sanitization"), so `java\nscript:` reaches the DOM as
  // `javascript:`. Strip them before the scheme test rather than trusting
  // `trim()`, which only touches the ends: the check has to read the same
  // scheme the browser will.
  const trimmed = url.replace(/[\t\n\r]/g, '').trim();
  if (!trimmed) return null;
  // No scheme at all: a path on the current origin, which is where our own
  // /api/images/ URLs land. `//host/x` is scheme-relative and inherits https.
  if (trimmed.startsWith('/') || !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return IMAGE_SCHEME.test(trimmed) ? trimmed : null;
}
