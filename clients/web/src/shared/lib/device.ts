// Naming a device from a User-Agent string, for the sessions list, passkey
// enrolment and push subscriptions.

export type DeviceKind = 'tv' | 'mobile' | 'desktop';

function match<T extends string>(s: string, table: readonly (readonly [RegExp, T])[]): T | null {
  for (const [re, label] of table) if (re.test(s)) return label;
  return null;
}

// A KROMA app naming itself: `Kroma/<version> (<model>; <os> <version>)`. Sent
// because the platform's own UA carries neither a browser nor an OS token (iOS
// `KROMA/1 CFNetwork/… Darwin/…`, Android `okhttp/4.12.0`). Quantifiers are
// crafted so a near-miss cannot backtrack.
const NATIVE_UA = /^kroma\/[^\s(]+\s+\(([^;()]+);([^)]*)\)/i;

const KINDS: [RegExp, DeviceKind][] = [
  [/tv|tizen|web0s|webos|smart-tv|crkey/, 'tv'],
  [/mobi|iphone|ipad|ipod|android/, 'mobile'],
];
const BROWSERS: [RegExp, string][] = [
  // Only reached by a client that predates NATIVE_UA: the app name alone still
  // beats "unknown device".
  [/^kroma\//, 'Kroma'],
  [/firefox|fxios/, 'Firefox'],
  [/edg/, 'Edge'],
  [/chrome|crios|crmo/, 'Chrome'],
  [/safari/, 'Safari'],
];
const OSES: [RegExp, string][] = [
  [/windows/, 'Windows'],
  [/tvos/, 'tvOS'],
  [/iphone|ipad|ipod|\bios\b/, 'iOS'],
  [/mac os x|macintosh/, 'macOS'],
  // Television platforms first: a Tizen or webOS set is Linux, and an Android
  // TV says Android.
  [/tizen/, 'Tizen'],
  // Both spellings LG ships, as @kroma/core's `isWebOsRuntime` reads them.
  [/web0s|webos/, 'webOS'],
  [/android tv/, 'Android TV'],
  [/android/, 'Android'],
  [/cros/, 'ChromeOS'],
  [/linux/, 'Linux'],
];

/** Best-effort; falls back to `unknown` / `desktop` on an unrecognised UA. */
export function deviceInfo(
  ua: string | null | undefined,
  unknown: string,
): { label: string; kind: DeviceKind } {
  const raw = (ua ?? '').trim();
  if (!raw) return { label: unknown, kind: 'desktop' };
  const s = raw.toLowerCase();
  const kind = match(s, KINDS) ?? 'desktop';
  // A native UA names the hardware ("iPhone 17 Pro"), which tells two phones on
  // one account apart; its platform still goes through the table so it is
  // spelled like every other row.
  const native = NATIVE_UA.exec(raw);
  const parts = native
    ? [native[1]?.trim(), match(native[2]?.toLowerCase() ?? '', OSES)]
    : [match(s, BROWSERS), match(s, OSES)];
  return { label: parts.filter(Boolean).join(' · ') || unknown, kind };
}
