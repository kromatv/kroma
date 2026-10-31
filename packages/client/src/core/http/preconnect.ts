/** Add a `<link rel="preconnect">` to the server origin (no-op off-DOM, for the
 *  page's own origin, or if one is already there). */
export function preconnect(baseUrl: string): void {
  if (typeof document === 'undefined') return;
  try {
    const origin = new URL(baseUrl).origin;
    if (origin === document.location.origin) return;
    if (document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  } catch {}
}
