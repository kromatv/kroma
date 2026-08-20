/** Parse a comma-separated Newznab category list into positive category ids. */
export function parseCats(text: string): number[] {
  return text
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
}
