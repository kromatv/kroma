import { useEffect, useMemo, useRef, useState } from 'react';

// A remux cuts on a source keyframe, so a player opens a fraction off what was
// asked for and an exact match would never come.
const REACHED_WITHIN_SEC = 1.5;

// A seek re-anchors the remux, and this is what hls.js gives a manifest before
// it abandons one.
const GIVE_UP_MS = 20_000;

const DRIFT_SEC = 2;

export interface HeldSeekTransport {
  cur: number;
  dur: number;
  waiting: boolean;
  anchor?: unknown;
  seekPreview?: number | null;
  seekTo(abs: number): void;
  skip(delta: number): void;
  scrubCommit?(): void;
}

interface Held {
  at: number;
  from: number;
  anchor: unknown;
}

const clamp = (abs: number, dur: number): number => Math.max(0, dur > 0 ? Math.min(abs, dur) : abs);

function closerThanBefore(t: HeldSeekTransport, held: Held): boolean {
  return Math.abs(t.cur - held.at) < Math.abs(held.from - held.at);
}

function reAnchored(t: HeldSeekTransport, held: Held): boolean {
  if (t.anchor !== undefined) return t.anchor !== held.anchor;
  const jumped = Math.abs(t.cur - held.from) > DRIFT_SEC;
  return jumped && closerThanBefore(t, held);
}

function landed(t: HeldSeekTransport, held: Held): boolean {
  if (Math.abs(t.cur - held.at) <= REACHED_WITHIN_SEC) return true;
  return !t.waiting && reAnchored(t, held);
}

/**
 * Draws a committed seek where it was aimed until playback gets there, shows the
 * wait there, and lets go once the film arrives, when a second seek replaces it,
 * or after twenty seconds.
 */
export function useHeldSeek<T extends HeldSeekTransport>(transport: T): T {
  const [held, setHeld] = useState<Held | null>(null);
  const live = useRef(transport);
  useEffect(() => {
    live.current = transport;
  });

  if (held !== null && landed(transport, held)) setHeld(null);

  useEffect(() => {
    if (held === null) return;
    const timer = setTimeout(() => setHeld(null), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [held]);

  return useMemo(() => {
    const aim = (abs: number) => {
      const at = clamp(abs, live.current.dur);
      setHeld({ at, from: live.current.cur, anchor: live.current.anchor });
      live.current.seekTo(at);
    };
    return {
      ...transport,
      cur: held?.at ?? transport.cur,
      waiting: transport.waiting || held !== null,
      seekTo: aim,
      skip: (delta: number) => aim((held?.at ?? live.current.cur) + delta),
      scrubCommit: () => {
        const target = live.current.seekPreview;
        if (target != null) {
          setHeld({
            at: clamp(target, live.current.dur),
            from: live.current.cur,
            anchor: live.current.anchor,
          });
        }
        live.current.scrubCommit?.();
      },
    };
  }, [transport, held]);
}
