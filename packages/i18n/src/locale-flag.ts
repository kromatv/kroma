const FLAG_REGION: ReadonlyMap<string, string> = new Map([
  ['de', 'DE'],
  ['en', 'US'],
  ['es', 'ES'],
  ['fr', 'FR'],
  ['ja', 'JP'],
  ['ko', 'KR'],
  ['pt', 'BR'],
  ['vi', 'VN'],
  ['zh-Hans', 'CN'],
]);

const REGION_SUBTAG = /^[a-z]{2,3}(?:-[a-z]{4})?-([a-z]{2})(?:-|$)/i;

/** The ISO 3166 country whose flag stands for a language: the one the table
 *  names, else the region its tag carries (`fr-CA` is `CA`), else `null`,
 *  where a picker draws no flag rather than a wrong one. */
export function flagRegion(code: string): string | null {
  const named = FLAG_REGION.get(code);
  if (named) {
    return named;
  }
  const region = REGION_SUBTAG.exec(code)?.[1];
  return region ? region.toUpperCase() : null;
}

/** Every language the table gives a flag to. */
export const FLAGGED_LOCALES: readonly string[] = [...FLAG_REGION.keys()];
