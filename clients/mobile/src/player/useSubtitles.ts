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
  preferredSubIndex,
} from '@kroma/core';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DownloadEntry } from '#mobile/lib/downloads';

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
  /** Tracks whose WebVTT could not be fetched (or held zero cues) THIS item:
   *  the picker shows them as unavailable instead of silently doing nothing. */
  failed: ReadonlySet<number>;
}

export function useSubtitles(
  client: KromaClient,
  item: MediaItem,
  /** Offline download entry: subtitle tracks come from its local sidecars. */
  offline?: DownloadEntry,
  /** The account's preferred subtitle language: a code auto-enables that track
   *  once per item (same behaviour as the TV's useSubtitleSelection); `off` or
   *  null leaves them off. A manual pick always wins afterwards. */
  preferredLanguage?: string | null,
): Subtitles {
  const [active, setActive] = useState<number | null>(null);
  const [downloaded, setDownloaded] = useState<DownloadedSub[]>([]);
  const [cues, setCues] = useState<Cue[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<ReadonlySet<number>>(new Set());
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

  // Auto-enable the preferred language, once per item. Keyed on the item so an
  // episode hand-off re-applies it, and never after a manual pick (the effect
  // only fires when the item changes, and a pick is a different setState).
  const appliedFor = useRef<string | null>(null);
  useEffect(() => {
    if (appliedFor.current === item.id) return;
    if (tracks.length === 0) return;
    appliedFor.current = item.id;
    // A fresh item gets a fresh benefit of the doubt.
    setFailed(new Set());
    const hit = preferredSubIndex(
      tracks.map((track) => ({
        index: track.index,
        language: track.language,
        url: track.url,
        generated: track.ai,
      })),
      preferredLanguage,
    );
    if (hit != null) setActive(hit);
  }, [item.id, tracks, preferredLanguage]);

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
    // A track that cannot be fetched - or fetches to ZERO cues - is not
    // working, and a picker row that silently does nothing reads as a broken
    // app. Mark it and step aside, so the sheet can say "unavailable".
    const broke = () => {
      if (cancelled) return;
      setCues(null);
      setFailed((prev) => new Set(prev).add(active));
      setActive(null);
    };
    load
      .then((raw) => {
        if (cancelled) return;
        const parsed = parseVtt(raw);
        if (parsed.length === 0) {
          broke();
          return;
        }
        hintRef.current = 0;
        setCues(parsed);
      })
      .catch(broke)
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

  return { tracks, active, pick, cueAt, loading, failed };
}
