/** A poster URL from the query string, kept only when it is a TMDB image. */
export function tmdbArt(raw: string | null): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.host !== 'image.tmdb.org') return null;
  return `https://image.tmdb.org${encodeURI(decodeURI(url.pathname))}`;
}
