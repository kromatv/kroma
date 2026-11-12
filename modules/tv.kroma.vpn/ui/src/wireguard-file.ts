/** What a pasted or dropped WireGuard file says about itself, read before it is
 * saved so the page can name the server and refuse what is not a config. */
export interface WireGuardFile {
  valid: boolean;
  proton: { server: string | null; portForwarding: boolean } | null;
}

const PROTON_SERVER = /^[A-Z-]+#\d+$/;

export function readWireGuard(text: string): WireGuardFile {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const has = (prefix: string) => lines.some((line) => line.startsWith(prefix));
  const valid =
    has('[Interface]') && has('[Peer]') && has('PrivateKey') && has('PublicKey') && has('Endpoint');
  const comments = lines.filter((line) => line.startsWith('#')).map((line) => line.slice(1).trim());
  const server = comments.find((comment) => PROTON_SERVER.test(comment)) ?? null;
  const marked = comments.some(
    (comment) => comment.startsWith('Key for') || comment.startsWith('NAT-PMP'),
  );
  const portForwarding = comments.some(
    (comment) => comment.startsWith('NAT-PMP') && comment.endsWith('= on'),
  );
  return { valid, proton: server || marked ? { server, portForwarding } : null };
}
