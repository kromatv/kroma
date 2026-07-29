// Naming a device from a User-Agent string.
//
// Shared rather than feature-local because three places need the same answer:
// the sessions list (whose device is this?), passkey enrolment (what do we call
// the key we just made?), and push subscription (which browser is subscribed?).
// Table-driven so adding a browser is a row, not another branch.

export type DeviceKind = 'tv' | 'mobile' | 'desktop';

/** First matching label for `s` from `[regex, label]` pairs, or `null`.
 *
 * Generic so a table of `DeviceKind`s answers with a `DeviceKind`: widening to
 * `string` here meant every caller cast the result back, which would have
 * silently accepted a typo'd kind in the table below. */
function match<T extends string>(s: string, table: readonly (readonly [RegExp, T])[]): T | null {
  for (const [re, label] of table) if (re.test(s)) return label;
  return null;
}

/** A KROMA app naming itself: `Kroma/<version> (<model>; <os> <version>)`.
 *
 * The native shells send this because the platform's own User-Agent says nothing
 * a session list can read - iOS hands out `KROMA/1 CFNetwork/… Darwin/…` and
 * Android `okhttp/4.12.0`, neither of which carries a browser or an OS token. A
 * signed-in phone therefore listed itself as an unknown desktop. */
// Every quantifier here is unambiguous with the one after it, which is what
// keeps a near-miss from re-trying the run at every position: `[^\s(]` excludes
// the space and the `(` that must follow it (`\S` matched both), and the OS
// group is `[^)]*` alone - a preceding `\s*` overlapped it, since `[^)]` matches
// whitespace too. The platform is trimmed at the call site instead.
const NATIVE_UA = /^kroma\/[^\s(]+\s+\(([^;()]+);([^)]*)\)/i;

const KINDS: [RegExp, DeviceKind][] = [
  [/tv|tizen|web0s|webos|smart-tv|crkey/, 'tv'],
  [/mobi|iphone|ipad|ipod|android/, 'mobile'],
];
const BROWSERS: [RegExp, string][] = [
  // A native shell where a browser would be. Only reached by a build that
  // predates NATIVE_UA (or a client yet to adopt it): the app name alone still
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
  // The television platforms, ahead of the systems they are built on: a Tizen
  // set and a webOS set are Linux, and an Android TV says Android.
  [/tizen/, 'Tizen'],
  // Both spellings LG ships, as @kroma/core's `isWebOsRuntime` reads them.
  [/web0s|webos/, 'webOS'],
  [/android tv/, 'Android TV'],
  [/android/, 'Android'],
  [/cros/, 'ChromeOS'],
  [/linux/, 'Linux'],
];

/** Best-effort device label + kind from a User-Agent string. Falls back to a
 * generic label when the UA is missing or unrecognised. */
export function deviceInfo(
  ua: string | null | undefined,
  unknown: string,
): { label: string; kind: DeviceKind } {
  const raw = (ua ?? '').trim();
  if (!raw) return { label: unknown, kind: 'desktop' };
  const s = raw.toLowerCase();
  const kind = match(s, KINDS) ?? 'desktop';
  // A native UA names the hardware ("iPhone 17 Pro"), which tells two phones on
  // one account apart far better than the app name would; its platform still
  // goes through the table so it is spelled like every other row.
  const native = NATIVE_UA.exec(raw);
  const parts = native
    ? [native[1]?.trim(), match(native[2]?.toLowerCase() ?? '', OSES)]
    : [match(s, BROWSERS), match(s, OSES)];
  return { label: parts.filter(Boolean).join(' · ') || unknown, kind };
}
