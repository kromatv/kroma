/**
 * A country or language name for a code that came off the wire, falling back to
 * the code itself.
 *
 * `Intl.DisplayNames.of` throws a `RangeError` on anything that is not a
 * well-formed code, and these codes are supplied by whichever devices happen to
 * be talking to somebody's server. A reader whose browser sends
 * `Accept-Language: aa-bb-cc-dd` would otherwise take the whole page down.
 */
export function displayName(kind: 'region' | 'language', locale: string) {
  const names = new Intl.DisplayNames([locale], { type: kind });
  return (code: string): string => {
    try {
      return names.of(code) ?? code;
    } catch {
      return code;
    }
  };
}
