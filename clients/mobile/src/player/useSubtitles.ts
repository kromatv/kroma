// Subtitle selection + cue rendering state for the mobile player. Same model
// as the TV client's useSubtitleSelection: embedded text tracks first, then
// on-device generated tracks (indices 1000+); the app fetches the WebVTT itself
// and renders cues as an overlay, so a "pick" is just state.

import type { KromaClient } from '@kromatv/client';
import type { MediaItem } from '@kromatv/client/media';
import type { DownloadedSub } from '@kromatv/client/subtitles';
import {
  activeCueText,
  type Cue,
  isTextSubtitle,
  parseVtt,
  preferredSubIndex,
} from '@kromatv/core';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DownloadEntry } from '#mobile/lib/downloads';

export interface SubView {
  index: number;
  language: string | null;
  url: string;
  label?: string;
  title?: string | null;
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
  const [loaded, setLoaded] = useState<{ index: number; cues: Cue[] } | null>(null);
  const [failed, setFailed] = useState<ReadonlySet<number>>(new Set());
  const hintRef = useRef(0);

  useEffect(() => {
    if (offline) return;
    let cancelled = false;
    client.subtitles
      .downloaded(item.id)
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
      .map((s, index) => ({ index, language: s.language, title: s.title, codec: s.codec }))
      .filter((s) => isTextSubtitle(s.codec))
      .map((s) => ({
        index: s.index,
        language: s.language,
        title: s.title,
        url: client.media.subtitleUrl(item.id, s.index),
      }));
    const gen: SubView[] = downloaded.map((d, i) => ({
      index: 1000 + i,
      language: d.language,
      url: client.media.artwork.resolve(d.url) ?? d.url,
      label: d.label,
      ai: true,
    }));
    return [...embedded, ...gen];
  }, [client, item, downloaded, offline]);

  const [appliedFor, setAppliedFor] = useState<string | null>(null);
  if (appliedFor !== item.id && tracks.length > 0) {
    setAppliedFor(item.id);
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
  }

  useEffect(() => {
    const track = tracks.find((t) => t.index === active);
    if (active === null || !track) return;
    let cancelled = false;
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
        setLoaded({ index: active, cues: parsed });
      })
      .catch(broke);
    return () => {
      cancelled = true;
    };
  }, [active, tracks]);

  const cues = loaded !== null && loaded.index === active ? loaded.cues : null;
  const loading = cues === null && tracks.some((t) => t.index === active);

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
