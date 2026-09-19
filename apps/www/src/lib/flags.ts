// One small SVG per ISO 3166-1 code, bundled with the site so a flag never
// costs a request to a third party. Each stays its own hashed asset, fetched
// only for the countries a reader actually sees: left to `?url`, Vite would
// inline every flag under 4 KB into the page's chunk as a data URI.
const FLAGS = new Map(
  Object.entries(
    import.meta.glob<string>('../../node_modules/country-flag-icons/3x2/*.svg', {
      query: '?no-inline',
      import: 'default',
      eager: true,
    }),
  ).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.svg'.length), url]),
);

/** The flag for a country code from the collector, or nothing for a code
 * without one, which the caller shows without a flag. */
export function flagUrl(code: string): string | undefined {
  return FLAGS.get(code);
}
