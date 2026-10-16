import type { MediaItem } from '@kromatv/client/media';
import { channelLabel, codecLabel, langName } from '@kromatv/core';
import type { Translate } from '@kromatv/i18n';

export { langName };

/** "Français · AAC 5.1" language then codec/channels. */
export function audioString(t: Translate, item: Pick<MediaItem, 'audio'>): string {
  const a = item.audio;
  if (!a) return '-';
  const tech = [codecLabel(a.codec), channelLabel(a.channels)].filter(Boolean).join(' ');
  return [langName(t, a.language), tech].filter(Boolean).join(' · ') || '-';
}

/** Warning-pill label for a problematic loudness verdict, or null when the mix
 * is fine / not analyzed yet (server `pipeline.loudness` stage). */
export function audioFlagLabel(
  t: Translate,
  item: Pick<MediaItem, 'audioAnalysis'> | null | undefined,
): string | null {
  switch (item?.audioAnalysis?.verdict) {
    case 'highDynamics':
      return t('content.audioHighDynamics');
    case 'quietDialog':
      return t('content.audioQuietDialog');
    default:
      return null;
  }
}

/** Distinct subtitle languages, or "Aucun". */
export function subString(t: Translate, item: Pick<MediaItem, 'subtitles'>): string {
  const langs = [...new Set(item.subtitles.map((s) => langName(t, s.language)).filter(Boolean))];
  return langs.length ? langs.join(', ') : t('subtitle.none');
}

// `62vh`, the fluid gutter and an inherited `text-shadow` are all browser-only,
