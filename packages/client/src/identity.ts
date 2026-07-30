// Who a client says it is, on the wire. Native shells build their own
// User-Agent (a browser's is already meaningful and forbidden to scripts,
// so it sets nothing here); the format is a contract shared with the account
// page's `deviceInfo` parser, so it cannot change on one side alone.

export interface DeviceIdentity {
  version: string;
  model: string;
  os: string;
}

/** Header-safe: a User-Agent is ASCII, and `;()` are the format's own
 * delimiters. Nothing here should be able to produce a header the platform then
 * refuses to send, however a device was named. */
const clean = (s: string): string =>
  s
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[;()]/g, '')
    .trim();

/** `Kroma/<version> (<model>; <os>)`, the User-Agent a native client sends. */
export function clientUserAgent({ version, model, os }: DeviceIdentity): string {
  return `Kroma/${clean(version) || 'dev'} (${clean(model) || 'Device'}; ${clean(os) || 'unknown'})`;
}
