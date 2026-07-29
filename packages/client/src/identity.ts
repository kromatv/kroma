// Who a client says it is, on the wire.
//
// The account page lists a signed-in device by the User-Agent captured when it
// signed in. A browser has one already, and owns it: the header is forbidden to
// scripts, so a browser shell sets nothing here. A native client has one that
// says nothing - iOS sends `KROMA/1 CFNetwork/… Darwin/…` and Android
// `okhttp/4.12.0`, neither of which names a device or a platform, which is why
// every signed-in phone and television listed itself as an unknown desktop.
//
// So the native shells (phone, TV) build their own, here rather than each in its
// own corner: this is one half of a contract whose other half is the parser on
// the account page (`deviceInfo`), and a format agreed in two places drifts.

/** What a device needs to say about itself to be listed as itself. */
export interface DeviceIdentity {
  /** This client build's version. */
  version: string;
  /** The hardware, as a person would name it: "iPhone 17 Pro", "Apple TV". */
  model: string;
  /** The platform with its version: "iOS 26.0", "tvOS 26.0", "Android TV 14". */
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
