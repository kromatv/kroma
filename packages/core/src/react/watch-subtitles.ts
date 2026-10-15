import type {
  WatchableApi,
  WatchableProbe,
  WatchableSubtitle,
  WatchableTicket,
  WatchableVtt,
} from '@kromatv/client/watchable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { preferredSubIndex } from '../lang';
import { type Cue, parseVtt } from '../subtitles';
import type { WatchableTarget } from '../watchable';
import {
  heldCues,
  type SeekState,
  SUBTITLE_REFETCH_MS,
  seekLanded,
  watchSubtitleTracks,
} from '../watchable-subtitles';

export interface WatchSubtitleTrack extends WatchableSubtitle {
  url: string;
}

export interface WatchSubtitles {
  tracks: readonly WatchSubtitleTrack[];
  active: number | null;
  pick: (index: number | null) => void;
  cues: readonly Cue[];
  loading: boolean;
}

export interface WatchSubtitlesOptions {
  watchable: Pick<WatchableApi, 'subtitles' | 'subtitleUrl'>;
  ready: Readonly<{ target: WatchableTarget; probe: WatchableProbe; ticket: WatchableTicket }>;
  positionSec: number;
  waiting: boolean;
  preferredLanguage?: string | null;
}

interface Held {
  index: number;
  cues: readonly Cue[];
}

interface TrackFollow {
  again: () => void;
  stop: () => void;
}

const NO_CUES: readonly Cue[] = [];
const NOTHING = (): void => undefined;

function followTrack(
  read: () => Promise<WatchableVtt>,
  onCues: (fetched: readonly Cue[], partial: boolean) => void,
): TrackFollow {
  let live = true;
  let partial = true;
  let asking = false;
  let queued = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ask = async (): Promise<void> => {
    if (asking) {
      queued = true;
      return;
    }
    asking = true;
    clearTimeout(timer);
    const answer = await read().catch(() => null);
    asking = false;
    if (!live) return;
    if (answer) {
      partial = answer.partial;
      onCues(parseVtt(answer.vtt), answer.partial);
    }
    if (!partial) return;
    if (queued) {
      queued = false;
      void ask();
      return;
    }
    timer = setTimeout(() => void ask(), SUBTITLE_REFETCH_MS);
  };
  void ask();
  return {
    again: () => {
      if (partial) void ask();
    },
    stop: () => {
      live = false;
      clearTimeout(timer);
    },
  };
}

/**
 * The track in the viewer's preferred language plays until they pick another. A
 * track still arriving is asked for again every twenty seconds and right after a
 * seek lands, keeping the cues already drawn, until it answers complete.
 */
export function useWatchSubtitles(opts: Readonly<WatchSubtitlesOptions>): WatchSubtitles {
  const { watchable, ready, positionSec, waiting, preferredLanguage = null } = opts;
  const { probe } = ready;
  const id = ready.target.entry.id;
  const file = ready.target.file.index;
  const token = ready.ticket.token;

  const tracks = useMemo(
    () =>
      watchSubtitleTracks(probe).map((track) => ({
        ...track,
        url: watchable.subtitleUrl({ id, file, index: track.index, token }),
      })),
    [watchable, probe, id, file, token],
  );
  const preferred = useMemo(
    () => preferredSubIndex(tracks, preferredLanguage),
    [tracks, preferredLanguage],
  );
  const [picked, setPicked] = useState<{ index: number | null } | null>(null);
  const active = picked ? picked.index : preferred;
  const pick = useCallback((index: number | null) => setPicked({ index }), []);

  const [held, setHeld] = useState<Held | null>(null);
  const refetch = useRef(NOTHING);
  useEffect(() => {
    if (active === null) return;
    const track = followTrack(
      () => watchable.subtitles({ id, file, index: active, token }),
      (fetched, partial) =>
        setHeld((last) => ({
          index: active,
          cues: heldCues(last?.index === active ? last.cues : NO_CUES, fetched, partial),
        })),
    );
    refetch.current = track.again;
    return () => {
      track.stop();
      refetch.current = NOTHING;
    };
  }, [watchable, id, file, token, active]);

  const seek = useRef<SeekState | null>(null);
  useEffect(() => {
    const { state, landed } = seekLanded(seek.current, { atSec: positionSec, waiting });
    seek.current = state;
    if (landed) refetch.current();
  }, [positionSec, waiting]);

  const current = held?.index === active ? held : null;
  return {
    tracks,
    active,
    pick,
    cues: current?.cues ?? NO_CUES,
    loading: active !== null && current === null,
  };
}
