const FORBIDDEN_TAG =
  /<\/?\s*(script|form|iframe|frame|frameset|object|embed|base|applet|svg|math|template|noscript|link)\b/i;
const FORBIDDEN_ATTR = /\b(srcset|formaction|ping|http-equiv|on[a-z]+)\s*=/i;
const URL_ATTR = /\b(href|src|action|background|poster)\s*=\s*/gi;
const URL_LIKE = /(?:https?:\/\/|www\.)[^\s"'<>()]+/gi;
const CSS_ESCAPE = /url\s*\(|@import\b|expression\s*\(|-moz-binding|behavior\s*:/i;

/** Where a message's links may lead. */
export type Allowed = (url: string) => boolean;

/** Any link on `origin`: what a grant permits. */
export function onOrigin(origin: string): Allowed {
  const o = origin.toLowerCase();
  return (url) => {
    const u = url.trim().toLowerCase();
    return u === o || u.startsWith(`${o}/`) || u.startsWith(`${o}?`) || u.startsWith(`${o}#`);
  };
}

/** One link and no other: what an activation link permits. */
export function exactly(link: string): Allowed {
  return (url) => url.trim() === link;
}

// The attribute value that starts at `from`: a quoted run, else up to
// whitespace or the end of the tag. A character walk rather than a pattern, so
// a value of any length is read in one pass.
function attributeValue(html: string, from: number): string {
  const quote = html[from];
  if (quote === '"' || quote === "'") {
    const end = html.indexOf(quote, from + 1);
    return end === -1 ? html.slice(from + 1) : html.slice(from + 1, end);
  }
  let end = from;
  while (end < html.length && !/[\s>]/.test(html[end] ?? '')) end++;
  return html.slice(from, end);
}

/**
 * Why a message may not leave, or `null` when it may. Every link, in the html
 * and in the text, must be one `allowed` says; nothing in the html may run,
 * submit, embed or redirect.
 *
 * Attributes are matched over the whole document rather than tag by tag: a
 * `>` smuggled into one attribute value would otherwise end the "tag" early
 * and hide the attributes after it from the scan, while a mail client parses
 * them fine. The price is that prose spelled like an attribute (`one=two`)
 * is refused too, and the server falls back to hand delivery.
 */
export function refuseContent(allowed: Allowed, text: string, html: string): string | null {
  const tag = FORBIDDEN_TAG.exec(html);
  if (tag) return `html: <${(tag[1] ?? '').toLowerCase()}> is not allowed`;
  if (CSS_ESCAPE.test(html)) return 'html: css that loads or runs is not allowed';
  const attr = FORBIDDEN_ATTR.exec(html);
  if (attr) return `html: ${(attr[1] ?? '').toLowerCase()} is not allowed`;
  for (const m of html.matchAll(URL_ATTR)) {
    const url = attributeValue(html, m.index + m[0].length).trim();
    if (url.toLowerCase().startsWith('cid:')) continue;
    if (!allowed(url)) return 'html: a link leads where this message may not';
  }
  for (const [url] of html.matchAll(URL_LIKE)) {
    if (!allowed(url)) return 'html: a link leads where this message may not';
  }
  for (const [url] of text.matchAll(URL_LIKE)) {
    if (!allowed(url)) return 'text: a link leads where this message may not';
  }
  return null;
}
