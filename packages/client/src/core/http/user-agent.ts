export interface DeviceIdentity {
  version: string;
  model: string;
  os: string;
}

const clean = (s: string): string =>
  s
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[;()]/g, '')
    .trim();

/** `Kroma/<version> (<model>; <os>)`, the User-Agent a native client sends. */
export function clientUserAgent({ version, model, os }: DeviceIdentity): string {
  return `Kroma/${clean(version) || 'dev'} (${clean(model) || 'Device'}; ${clean(os) || 'unknown'})`;
}
