import { artworkWidth, type MediaItem, type VideoTrack } from '@kromatv/client/media';
import { match } from './match';

/** Formats a runtime as `"2h08"` or `"47min"`. */
export function formatRuntime(durationMs: number | null | undefined): string {
  if (!durationMs || durationMs <= 0) {
    return '';
  }
  const totalMin = Math.round(durationMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) {
    return `${m}min`;
  }
  return `${h}h${m.toString().padStart(2, '0')}`;
}

/** Requests a downscaled rendition of locally-cached artwork (`?w=`, snapped to
 * a server-side bucket) for the given DISPLAY width, through the same
 * {@link artworkWidth} the client's own art helpers use. Remote (TMDB fallback)
 * and non-image URLs pass through untouched. */
export function sizedImageUrl(
  url: string | null | undefined,
  displayWidth: number,
  scale = 1,
): string | null {
  if (!url) {
    return null;
  }
  if (!url.includes('/api/images/') || url.includes('?')) {
    return url;
  }
  return `${url}?w=${artworkWidth(displayWidth, scale)}`;
}

// Schemes an <img> may load. `data:` is narrowed to images: a bare `data:` allow-list would
// also admit `data:text/html`, which is a navigation payload rather than artwork.

/** Rolling 31x unsigned hash, exposed raw so every derived colour (hue, avatar
 * gradients, placeholder tilts) keys off the same value for the same string. */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + (s.codePointAt(i) ?? 0)) >>> 0;
  }
  return h;
}

/** Deterministic hue (0-359) for a string (key-art gradients here, genre art in
 * genre-art.ts) so the same name always lands on the same hue. */
export function hueFromString(s: string): number {
  return hashString(s) % 360;
}

/** Deterministic poster stand-in for a title with no artwork: the same string
 * always draws the same two-tone gradient, so a grid stays stable across
 * reloads. A CSS string, like {@link genreTint}. */
export function posterGradient(title: string): string {
  const h = hueFromString(title);
  return `radial-gradient(120% 90% at 30% 16%, hsla(${(h + 22) % 360},60%,46%,.5), transparent 62%), linear-gradient(155deg, hsl(${h} 42% 27%), hsl(${(h + 30) % 360} 48% 10%))`;
}

const TINT_STEP = 15;

/** Deterministic two-stop key-art gradient derived from an item id, drawn from
 *  24 hues so every title shares one of 24 fills. */
export function posterColors(id: string): [string, string] {
  const hue = (Math.round(hueFromString(id) / TINT_STEP) * TINT_STEP) % 360;
  const hue2 = (hue + 40) % 360;
  return [`hsl(${hue} 38% 26%)`, `hsl(${hue2} 50% 12%)`];
}

export function codecLabel(codec: string): string {
  switch (codec) {
    case 'hevc':
      return 'H.265';
    case 'h264':
      return 'H.264';
    case 'av1':
      return 'AV1';
    case 'vp9':
      return 'VP9';
    default:
      return codec.toUpperCase();
  }
}

/** Top-right quality badge text for a video track, or null. */
export function qualityBadgeForVideo(video: VideoTrack | null | undefined): string | null {
  if (!video) {
    return null;
  }
  return match(video)
    .when((v) => v.hdr === true, 'HDR')
    .when((v) => (v.width ?? 0) >= 3840, '4K')
    .when((v) => v.codec === 'hevc', 'H.265')
    .otherwise(null);
}

/** Top-right quality badge text for an item, or null. */
export function qualityBadge(item: Pick<MediaItem, 'video'>): string | null {
  return qualityBadgeForVideo(item.video);
}

/** Zero-padded season/episode tag, e.g. "S01E05" (or a range "S01E05-E06" for a
 * multi-episode file). Empty string when the item carries no episode numbering. */
export function episodeTag(
  item: Pick<MediaItem, 'season' | 'episode'> & { episodeEnd?: number | null },
): string {
  if (item.season == null || item.episode == null) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  const base = `S${pad(item.season)}E${pad(item.episode)}`;
  return item.episodeEnd != null && item.episodeEnd > item.episode
    ? `${base}-E${pad(item.episodeEnd)}`
    : base;
}

/** The player header's secondary line: for an episode "Show · S01E05" (the parts
 * that exist), else the movie meta line "2024 · 2h08 · H.265 · 4K". */
export function playerSubtitle(item: MediaItem): string {
  if (item.kind === 'episode') {
    const parts = [item.showTitle, episodeTag(item)].filter(Boolean);
    if (parts.length) {
      return parts.join(' · ');
    }
  }
  return metaLine(item);
}

/** Terse dot-separated metadata line, e.g. "2024 · 2h08 · H.265 · 4K". */
export function metaLine(item: Pick<MediaItem, 'year' | 'durationMs' | 'video'>): string {
  const parts: string[] = [];
  if (item.year) {
    parts.push(String(item.year));
  }
  const rt = formatRuntime(item.durationMs);
  if (rt) {
    parts.push(rt);
  }
  if (item.video?.codec) {
    parts.push(codecLabel(item.video.codec));
  }
  if ((item.video?.width ?? 0) >= 3840) {
    parts.push('4K');
  }
  if (item.video?.hdr) {
    parts.push('HDR');
  }
  return parts.join(' · ');
}

/** Resolve a metadata image path (relative `/api/...` cached art, or an
 * absolute URL) against a KROMA origin. */
export function resolveImageUrl(apiBase: string, url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  return /^https?:\/\//.test(url) ? url : `${apiBase}${url}`;
}

/** Two-letter language code for a track badge, e.g. "FR" (or "ST" when unknown). */
export function langCode(lang: string | null | undefined): string {
  if (!lang) {
    return 'ST';
  }
  return lang.slice(0, 2).toUpperCase();
}

/** Channel-layout label, e.g. 6 → "5.1", 2 → "2.0", 1 → "Mono". Null when unknown. */
export function channelLabel(ch: number | null | undefined): string | null {
  if (!ch) {
    return null;
  }
  if (ch <= 1) {
    return 'Mono';
  }
  if (ch === 2) {
    return '2.0';
  }
  if (ch === 6) {
    return '5.1';
  }
  if (ch === 8) {
    return '7.1';
  }
  return `${ch}.0`;
}

// Build-identity helpers take primitives rather than a BuildInfo, since each
// shell reads that record from its own bundler (Expo's manifest, a Vite define).

/** The commit as it should be READ - flagged when the tree it was built from had
 * uncommitted changes, since that hash alone no longer describes the binary. */
export function commitLabel(commit: string | null | undefined, dirty: boolean): string | null {
  if (!commit) {
    return null;
  }
  return dirty ? `${commit}-dirty` : commit;
}

/** `https://github.com/owner/repo` -> `github.com/owner/repo`, the same trim the
 * server row gives its URL. A television cannot follow the link, so it is shown
 * as something to TYPE elsewhere. */
export function repoLabel(repository: string | null | undefined): string | null {
  return repository?.replace(/^https?:\/\//, '') ?? null;
}

/** The build stamp in the reader's own locale. Falls back to the raw ISO string
 * rather than to nothing: an unparseable date is still information. */
export function formatBuildDate(iso: string | null | undefined, locale: string): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  try {
    return date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return date.toISOString();
  }
}
