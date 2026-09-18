const escaped = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

const STYLE =
  'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
  'background:#0f0f10;color:#f2f2f2;font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif}' +
  'main{max-width:28rem;padding:2rem;text-align:center}h1{font-size:1.4rem;margin:0 0 .5rem}' +
  'p{color:#b8b8b8;margin:.5rem 0 1.25rem}button{font:inherit;padding:.75rem 1.5rem;border:0;' +
  'border-radius:.75rem;background:#e2b053;color:#111;cursor:pointer}';

/**
 * The relay's own opt-out page for one mailbox and one server: the question,
 * or the answer once the button was pressed. Written in both languages the
 * product speaks, since the relay does not know which one the reader does.
 */
export function optOutPage(host: string, done: boolean): string {
  const h = escaped(host);
  const body = done
    ? `<h1>C'est fait</h1><p>${h} ne vous enverra plus d'e-mails par KROMA.</p>` +
      `<p lang="en">Done. ${h} will no longer email you through KROMA.</p>`
    : `<h1>Ne plus recevoir d'e-mails de ${h} ?</h1>` +
      `<p>Ce serveur KROMA ne pourra plus vous écrire par ce relais.</p>` +
      `<p lang="en">Stop receiving email from ${h}? This KROMA server will no longer be able to write to you through this relay.</p>` +
      `<form method="post"><button type="submit">Ne plus recevoir / Unsubscribe</button></form>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>KROMA</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
}
