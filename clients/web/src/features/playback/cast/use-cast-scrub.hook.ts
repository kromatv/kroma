import type { Cast, SeekTarget } from '@kromatv/ui';
import { useCallback, useEffect, useState } from 'react';

interface CastScrubOptions {
  positionMs: number;
  durationMs: number;
  send: Cast['send'];
}

/** What the seek bar and the skip keys drive when the film plays on another
 * screen: the same preview-then-commit a local player has. */
export interface CastScrub extends SeekTarget {
  /** Where the handle is drawn while a scrub is in flight, in seconds. */
  seekPreview: number | null;
}

const SETTLED_WITHIN_S = 2;
const SETTLE_TIMEOUT_MS = 4000;

function useLetGo(sent: number | null, setSent: (value: null) => void) {
  useEffect(() => {
    if (sent === null) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setSent(null);
    }, SETTLE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [sent, setSent]);
}

/** Seeking a television from here. A scrub moves a preview only; committing it
 * sends one seek, and the preview stays where it was left until the television
 * reports a position near it, so the handle never jumps back to the old place
 * while the order is on its way. */
export function useCastScrub({ positionMs, durationMs, send }: CastScrubOptions): CastScrub {
  const [preview, setPreview] = useState<number | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const cur = positionMs / 1000;
  if (sent !== null && Math.abs(cur - sent) <= SETTLED_WITHIN_S) {
    setSent(null);
  }

  useLetGo(sent, setSent);

  const scrubCommit = useCallback(() => {
    if (preview === null) {
      return;
    }
    void send({ type: 'seek', positionMs: Math.round(preview * 1000) });
    setSent(preview);
    setPreview(null);
  }, [preview, send]);

  return {
    cur,
    dur: durationMs / 1000,
    seekPreview: preview ?? sent,
    scrubPreview: setPreview,
    scrubCommit,
  };
}
