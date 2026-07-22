// Subtitle selection + cue rendering state for the mobile player. Same model
// as the TV client's useSubtitleSelection: embedded text tracks first, then
// on-device generated tracks (indices 1000+); the app fetches the WebVTT itself
// and renders cues as an overlay, so a "pick" is just state.

import {
  activeCueText,
  type Cue,
  type DownloadedSub,
  isTextSubtitle,
  type KromaClient,
  type MediaItem,
  parseVtt,
} from '@kroma/core';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DownloadEntry } from '../lib/downloads';

export interface SubView {
  index: number;
  language: string | null;
  url: string;
  label?: string;
  ai?: boolean;
}

export interface Subtitles {
  tracks: SubView[];
  active: number | null;
  pick(index: number | null): void;
  /** The cue text to overlay at the given absolute clock, '' when none. */
  cueAt(absSec: number): string;
  loading: boolean;
}

export function useSubtitles(
  client: KromaClient,
  item: MediaItem,
  /** Offline download entry: subtitle tracks come from its local sidecars. */
  offline?: DownloadEntry,
): Subtitles {
  const [active, setActive] = useState<number | null>(null);
  const [downloaded, setDownloaded] = useState<DownloadedSub[]>([]);
  const [cues, setCues] = useState<Cue[] | null>(null);
  const [loading, setLoading] = useState(false);
  const hintRef = useRef(0);

  useEffect(() => {
    if (offline) return;
    let cancelled = false;
    client
      .downloadedSubtitles(item.id)
      .then((d) => !cancelled && setDownloaded(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, item.id, offline]);

  const tracks = useMemo<SubView[]>(() => {
    if (offline) {
      return (offline.subs ?? []).map((sub) => ({
        index: sub.index,
        language: sub.language,
        url: sub.path,
        label: sub.label,
        ai: sub.ai,
      }));
    }
    const embedded = item.subtitles
      .map((s, index) => ({ index, language: s.language, codec: s.codec }))
      .filter((s) => isTextSubtitle(s.codec))
      .map((s) => ({
        index: s.index,
        language: s.language,
        url: client.subtitleUrl(item.id, s.index),
      }));
    const gen: SubView[] = downloaded.map((d, i) => ({
      index: 1000 + i,
      language: d.language,
      url: client.resolveArt(d.url) ?? d.url,
      label: d.label,
      ai: true,
    }));
    return [...embedded, ...gen];
  }, [client, item, downloaded, offline]);

  // Fetch + parse the selected track (subtitle extraction can take a while
  // server-side on first request; the fetch just waits).
  useEffect(() => {
    if (active === null) {
      setCues(null);
      return;
    }
    const track = tracks.find((t) => t.index === active);
    if (!track) return;
    let cancelled = false;
    setLoading(true);
    setCues(null);
    // Local sidecar VTTs are file:// URIs; RN fetch cannot read those.
    const load = track.url.startsWith('file:')
      ? FileSystem.readAsStringAsync(track.url)
      : fetch(track.url).then((r) =>
          r.ok ? r.text() : Promise.reject(new Error(String(r.status))),
        );
    load
      .then((raw) => {
        if (cancelled) return;
        hintRef.current = 0;
        setCues(parseVtt(raw));
      })
      .catch(() => !cancelled && setCues([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [active, tracks]);

  const pick = useCallback((index: number | null) => setActive(index), []);

  const cueAt = useCallback(
    (absSec: number): string => {
      if (!cues || cues.length === 0) return '';
      const hit = activeCueText(cues, absSec, hintRef.current);
      hintRef.current = hit.index;
      return hit.text;
    },
    [cues],
  );

  return { tracks, active, pick, cueAt, loading };
}
