// Why the LAN server a viewer already runs is unreachable from this page.
//
// The packaged TV apps load from the device (a .wgt / .ipk on disk), so their
// origin is not https and they may talk to `http://192.168.1.50:4040` freely.
// This shell is served from https://tv.kroma.tv, and a browser refuses to let an
// HTTPS document issue plaintext subresource requests - "active mixed content" -
// because a network attacker who can rewrite the http response can rewrite the
// page's data, which would silently void the padlock the origin promises. There
// is no opt-in a page can make; only the viewer can override it per site.
//
// So `@kroma/core`'s discovery, whose default candidate is
// `http://kroma.local:4040` and whose `resolveScheme` probes https then http,
// finds nothing here: the https probe is refused by a LAN server that speaks
// plaintext, and the http probe is blocked before it leaves the browser. Both
// legs fail, and they fail looking like "server not found" rather than like a
// policy decision - which is exactly what this notice exists to correct.
//
// A server reachable over real HTTPS (own domain, or a Cloudflare Tunnel) works
// normally. Everything else wants the packaged app, or the web client served
// same-origin by the KROMA server itself.

const DISMISSED = 'kroma.tvweb.mixedContentDismissed';

/** Show a one-off notice when this page is HTTPS, so a viewer whose server is a
 * plain-http LAN box learns why it will never be found here. No-op on http
 * origins (a local `vite preview`), and no-op once dismissed. */
export function warnIfMixedContent(): void {
  if (globalThis.location?.protocol !== 'https:') return;
  try {
    if (localStorage.getItem(DISMISSED) === '1') return;
  } catch {
    // Storage denied (private mode): show the notice rather than suppress it.
  }

  const bar = document.createElement('div');
  bar.setAttribute('role', 'note');
  bar.style.cssText = [
    'position:fixed',
    'inset:auto 16px 16px 16px',
    'z-index:2147483647',
    'max-width:760px',
    'margin:0 auto',
    'padding:14px 16px',
    'border-radius:12px',
    'border:1px solid rgba(244,182,66,.35)',
    'background:rgba(10,10,12,.94)',
    'color:#f4f4f5',
    'font:500 14px/1.5 system-ui,sans-serif',
    'box-shadow:0 8px 32px rgba(0,0,0,.5)',
    'display:flex',
    'gap:12px',
    'align-items:flex-start',
  ].join(';');

  const text = document.createElement('div');
  text.style.flex = '1';
  text.innerHTML =
    '<strong style="color:#f4b642">A server on your home network will not work here.</strong><br>' +
    'This page is served over HTTPS, and browsers block HTTPS pages from reaching ' +
    '<code>http://</code> addresses. Use the Samsung, LG or desktop app for a LAN server ' +
    '&mdash; or point this at a server published over HTTPS.';

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Got it';
  close.style.cssText =
    'flex:none;cursor:pointer;border:0;border-radius:8px;padding:8px 14px;' +
    'background:#f4b642;color:#0a0a0c;font:600 14px/1 system-ui,sans-serif';
  close.onclick = () => {
    bar.remove();
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {
      // Nothing to persist to; the notice simply returns on the next load.
    }
  };

  bar.append(text, close);
  document.body.appendChild(bar);
}
