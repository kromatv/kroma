/** A user-entered server address, safe to open in a browser tab. */
export function serverAddress(value: string): string | null {
  const address = value.trim();
  if (!address) return null;
  const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(address);
  const withProtocol = hasProtocol ? address : `http://${address}`;
  try {
    const url = new URL(withProtocol);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const authority = address.split(/[/?#]/)[0] ?? '';
    const hasExplicitPort = /:\d+$/.test(authority);
    if (!hasProtocol && !url.port && !hasExplicitPort) url.port = '4040';
    return url.href;
  } catch {
    return null;
  }
}
