import {
  audioTrackLabel,
  audioTracksOf,
  langName,
  type MediaItem,
  refineTrackLang,
} from '@kroma/core';
import type { useT } from '#mobile/lib/i18n';
import type { Engine } from './engine';
import type { Subtitles } from './useSubtitles';

export interface AudioOption {
  index: number;
  prefCode: string | null;
  label: string;
}

// `prefCode` is the language refined by the variant in the track's title
// ('fre' + "VFF …" -> 'fr-FR'), so picking the France dub never auto-picks
// the Quebec one on the next title.
export function audioOptions(
  engine: Engine,
  item: MediaItem,
  t: ReturnType<typeof useT>,
): AudioOption[] {
  const itemAudio = audioTracksOf(item);
  if (!engine.offline) {
    return itemAudio.map((track, i) => ({
      index: track.index,
      prefCode: refineTrackLang(track.language, track.title),
      label: audioTrackLabel(t, track) ?? `#${i + 1}`,
    }));
  }
  const aligned = engine.localAudio.length === itemAudio.length;
  return engine.localAudio.map((native, i) => ({
    index: i,
    prefCode: refineTrackLang(native.language, native.label),
    label:
      (aligned ? audioTrackLabel(t, itemAudio[i]) : undefined) ??
      (native.label?.trim() || langName(t, native.language) || `#${i + 1}`),
  }));
}

export function subtitleLabel(subs: Subtitles, t: ReturnType<typeof useT>): string {
  if (subs.active === null) return t('player.subtitlesOff');
  const track = subs.tracks.find((s) => s.index === subs.active);
  return track?.label?.trim() ?? langName(t, track?.language) ?? `#${(subs.active ?? 0) + 1}`;
}

export function subNote(
  t: ReturnType<typeof useT>,
  subs: Subtitles,
  index: number,
): string | undefined {
  if (subs.failed.has(index)) return t('error.subtitleUnavailable');
  if (subs.active === index && subs.loading) return t('player.subPreparing');
  return undefined;
}

export function qualityBadge(item: MediaItem): string {
  const v = item.video;
  if (!v) return '';
  const res = v.height ? `${v.height}p` : null;
  const codec = v.codec ? v.codec.toUpperCase() : null;
  const parts = [res, codec, v.hdr ? 'HDR' : null].filter(Boolean);
  return parts.length ? ` · ${parts.join(' ')}` : '';
}
