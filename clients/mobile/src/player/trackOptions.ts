import type { AudioTrack, MediaItem } from '@kromatv/client/media';
import { audioTrackLabel, audioTracksOf, langBase, langName, refineTrackLang } from '@kromatv/core';
import type { useT } from '#mobile/lib/i18n';
import type { Engine } from './engine';
import type { Subtitles, SubView } from './useSubtitles';

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
    return distinguishOptions(
      t,
      itemAudio.map((track, i) => ({
        index: track.index,
        prefCode: refineTrackLang(track.language, track.title),
        label: audioTrackLabel(t, track) ?? `#${i + 1}`,
      })),
    );
  }
  const aligned = engine.localAudio.length === itemAudio.length;
  return distinguishOptions(
    t,
    engine.localAudio.map((native, i) => {
      let metadata: AudioTrack | undefined;
      if (aligned) {
        const language = langBase(native.language);
        const matches = itemAudio.filter(
          (track) => language && langBase(track.language) === language,
        );
        metadata = matches.length === 1 ? matches[0] : itemAudio[i];
        if (language && langBase(metadata?.language) !== language) metadata = undefined;
      }
      return {
        index: i,
        prefCode: refineTrackLang(native.language, native.name || metadata?.title || native.label),
        label:
          audioTrackLabel(t, metadata) ??
          (native.name?.trim() ||
            native.label?.trim() ||
            langName(t, native.language) ||
            `#${i + 1}`),
      };
    }),
  );
}

function distinguishOptions<T extends { index: number; label: string }>(
  t: ReturnType<typeof useT>,
  options: T[],
): T[] {
  const counts = new Map<string, number>();
  for (const option of options) counts.set(option.label, (counts.get(option.label) ?? 0) + 1);
  return options.map((option) =>
    (counts.get(option.label) ?? 0) > 1
      ? {
          ...option,
          label: `${option.label} · ${t('player.subtitleTrack', { number: option.index + 1 })}`,
        }
      : option,
  );
}

export function subtitleOptions(t: ReturnType<typeof useT>, tracks: SubView[]) {
  return distinguishOptions(
    t,
    tracks.map((track) => ({ ...track, label: subtitleRowLabel(t, track) })),
  );
}

export function subtitleRowLabel(t: ReturnType<typeof useT>, track: SubView): string {
  const name = track.label?.trim() || langName(t, track.language) || `#${track.index + 1}`;
  const title = track.title?.trim();
  const forcedInTitle = /forced|forc[ée]/i.test(title ?? '');
  return [
    name,
    title?.toLocaleLowerCase() !== name.toLocaleLowerCase() ? title : undefined,
    track.forced && !forcedInTitle ? t('player.subForced') : undefined,
    track.ai ? t('player.subAiBadge') : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function subtitleLabel(subs: Subtitles, t: ReturnType<typeof useT>): string {
  if (subs.active === null) return t('player.subtitlesOff');
  const track = subtitleOptions(t, subs.tracks).find((s) => s.index === subs.active);
  return track ? track.label : `#${(subs.active ?? 0) + 1}`;
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
