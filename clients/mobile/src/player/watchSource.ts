import type { WatchableApi, WatchableProbe } from '@kromatv/client/watchable';
import {
  type Arrival,
  activeCueText,
  audioTrackLabel,
  fileContainer,
  pictureBadge,
  type WatchReady,
  watchableDeclaration,
} from '@kromatv/core';
import type { WatchSubtitles } from '@kromatv/core/react';
import type { Translate } from '@kromatv/i18n';
import { buildLeanStats, type PlayerStats, withArrivalStats } from '@kromatv/ui';
import { mobileCaps } from '#mobile/player/caps';
import type { AudioOption } from '#mobile/player/trackOptions';
import type { Subtitles } from '#mobile/player/useSubtitles';

const NONE_FAILED: ReadonlySet<number> = new Set();

/** The tracks the module's probe found, in the order an HLS master indexes
 * them. A watch file has no catalogue row to remember a language against, so
 * nothing is offered as a preference. */
export function watchAudioOptions(probe: WatchableProbe, t: Translate): AudioOption[] {
  return probe.audio.map((track, position) => ({
    index: position,
    prefCode: null,
    label:
      audioTrackLabel(t, { ...track, title: track.title ?? null, default: position === 0 }) ??
      `#${position + 1}`,
  }));
}

export function watchQuality(probe: WatchableProbe, t: Translate): string {
  const badge = pictureBadge(probe.video);
  return badge ? `${t('player.qualityAuto')} · ${badge}` : t('player.qualityAuto');
}

/** The file's text tracks as the sheet and the cue line take them, drawn from
 * the cues held so far. A track still arriving is never marked unavailable for
 * having none yet. */
export function watchSheetSubtitles(subs: WatchSubtitles): Subtitles {
  return {
    tracks: subs.tracks.map(({ index, language, url }) => ({ index, language, url })),
    active: subs.active,
    pick: subs.pick,
    cueAt: (absSec) => activeCueText(subs.cues, absSec, 0).text,
    loading: subs.loading,
    failed: NONE_FAILED,
  };
}

/** One master and the second its own clock begins at, which a player adds back
 * to read the film's time. The two are built together because a URL paired with
 * an unrelated anchor reads every position wrong. */
export interface WatchMaster {
  uri: string;
  anchorSec: number;
}

/**
 * Choosing a track asks for a new master rather than switching inside the
 * player, because the index is what the module muxes.
 */
export function watchMaster(
  watchable: WatchableApi,
  { target, ticket }: WatchReady,
  audio: number,
  anchorSec = 0,
): WatchMaster {
  return {
    anchorSec,
    uri: watchable.hlsMasterUrl({
      id: target.entry.id,
      file: target.file.index,
      token: ticket.token,
      audio,
      startSec: anchorSec,
      declaration: watchableDeclaration(mobileCaps()),
    }),
  };
}

export interface WatchStatsInput {
  ready: WatchReady;
  arrival: Arrival;
  audioIndex: number;
  cur: number;
  dur: number;
  buffered: number;
  rate: number;
  t: Translate;
}

export function watchStats(input: Readonly<WatchStatsInput>): PlayerStats {
  const { ready, arrival, audioIndex, cur, dur, buffered, rate, t } = input;
  const { probe, target } = ready;
  const base = buildLeanStats({
    item: {
      title: target.entry.title ?? target.file.name,
      container: fileContainer(target.file.name),
      video: probe.video,
    },
    cur,
    dur,
    bufEnd: buffered,
    audioTracks: probe.audio.map((track, position) => ({
      ...track,
      title: track.title ?? null,
      default: track.default ?? position === 0,
    })),
    audioIndex,
    video: null,
    mode: 'HLS',
    t,
    extra: [
      {
        label: t('stats.speed'),
        value: rate === 1 ? t('player.normalSpeed') : `${rate}×`,
        group: t('stats.playback'),
      },
    ],
  });
  return withArrivalStats({ base, arrival, t });
}
