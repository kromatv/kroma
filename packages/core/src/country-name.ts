/** A country's name in `locale` for an ISO 3166 code, "Allemagne" for `DE` in
 * French, or the code itself where the engine names no regions (Chromium
 * before 81). */
export function countryName(code: string, locale?: string): string {
  try {
    return new Intl.DisplayNames(locale ? [locale] : [], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export interface CountryOption {
  code: string;
  label: string;
}

/** `codes` as picker rows, named for `locale` and sorted by name. */
export function countryOptions(codes: readonly string[], locale?: string): CountryOption[] {
  const rows = codes.map((code) => ({ code, label: countryName(code, locale) }));
  return rows.sort((a, b) => a.label.localeCompare(b.label, locale));
}
