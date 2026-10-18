import type { KromaClient } from '@kromatv/client';
import type { MediaItem, SubtitleTrack } from '@kromatv/client/media';
import type { DownloadedSub, SubtitleId } from '@kromatv/client/subtitles';
import { isTextSubtitle, preferredSubIndex } from '@kromatv/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface SubView {
  index: number;
  language: string | null;
  url: string | null;
  label?: string;
  title?: string | null;
  forced?: boolean;
  subId?: SubtitleId;
  ai?: boolean;
}

export interface SubtitleSelection {
  rendered: SubView[];
  options: (number | null)[];
  active: number | null;
  pick: (index: number | null) => void;
  drop: (index: number) => void;
  reload: () => void;
}

/** Resolves an item's renderable subtitle tracks (the film's own + on-device
 * generated) and tracks the active selection. The custom <TvSubtitles> layer
 * renders cues itself, so "picking" is just state. */
export function useSubtitleSelection(
  client: KromaClient,
  item: MediaItem,
  /** The account's preferred subtitle language: a code auto-enables that track
   * when the file has it, `off` (or nothing) leaves subtitles off. */
  subtitleLanguage?: string | null,
): SubtitleSelection {
  const [active, setActive] = useState<number | null>(null);
  const [downloaded, setDownloaded] = useState<DownloadedSub[]>([]);
  const [failed, setFailed] = useState<{ itemId: string; indices: ReadonlySet<number> } | null>(
    null,
  );
  const [beside, setBeside] = useState<{ itemId: string; tracks: SubtitleTrack[] } | null>(null);
  const [nonce, setNonce] = useState(0);

  // oxlint-disable-next-line react-hooks/exhaustive-deps -- `nonce` is the reload trigger (bumped by reload()) that forces a re-fetch after a generation completes; it is intentionally a dependency though the body does not read it.
  useEffect(() => {
    let cancelled = false;
    client.subtitles
      .downloaded(item.id)
      .then((d) => !cancelled && setDownloaded(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, item.id, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // A list response carries only the tracks muxed into the file; the subtitle
  // files sitting beside it are read per request and appended by the single-item
  // endpoint alone.
  useEffect(() => {
    let cancelled = false;
    client.media
      .item(item.id)
      .then((full) => !cancelled && setBeside({ itemId: item.id, tracks: full.subtitles }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, item.id]);
  const complete = beside?.itemId === item.id ? beside.tracks : null;

  const filmTracks = useMemo<SubView[]>(
    () =>
      (complete ?? item.subtitles)
        .map((s, index) => ({
          index,
          language: s.language,
          title: s.title,
          forced: s.forced,
          url: isTextSubtitle(s.codec) ? client.media.subtitleUrl(item.id, index) : null,
        }))
        .filter((s) => s.url),
    [client, item, complete],
  );

  // Only the film's own tracks are considered - an AI-generated one is never
  // turned on behind the viewer's back. No match = subtitles stay off.
  const appliedRef = useRef<string | null>(null);
  useEffect(() => {
    const round = `${item.id}:${complete !== null}`;
    if (appliedRef.current === round) return;
    appliedRef.current = round;
    setActive(preferredSubIndex(filmTracks, subtitleLanguage));
  }, [item.id, complete, filmTracks, subtitleLanguage]);

  const failedHere = failed?.itemId === item.id ? failed.indices : null;
  const rendered = useMemo<SubView[]>(() => {
    // Generated tracks get high indices (1000+) so they never collide with the film's.
    const gen: SubView[] = downloaded.map((d, i) => ({
      index: 1000 + i,
      language: d.language,
      url: client.media.artwork.resolve(d.url) ?? d.url,
      label: d.label,
      subId: d.id,
      ai: true,
    }));
    return [...filmTracks, ...gen].filter((s) => !failedHere?.has(s.index));
  }, [client, filmTracks, downloaded, failedHere]);

  const options = useMemo<(number | null)[]>(
    () => [null, ...rendered.map((s) => s.index)],
    [rendered],
  );
  const pick = useCallback((index: number | null) => setActive(index), []);
  const drop = useCallback(
    (index: number) => {
      setFailed((prev) => ({
        itemId: item.id,
        indices: new Set(prev?.itemId === item.id ? prev.indices : []).add(index),
      }));
      setActive((cur) => (cur === index ? null : cur));
    },
    [item.id],
  );

  return { rendered, options, active, pick, drop, reload };
}
