import type { Cast, SeekTarget } from '@kromatv/ui';
import { useCallback, useState } from 'react';

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

/** Seeking a television from here. A scrub moves a preview only, and
 * committing it sends one seek. The session puts the playhead where the seek
 * was sent at once, so the handle has nowhere to jump back to. */
export function useCastScrub({ positionMs, durationMs, send }: CastScrubOptions): CastScrub {
  const [preview, setPreview] = useState<number | null>(null);

  const scrubCommit = useCallback(() => {
    if (preview === null) {
      return;
    }
    void send({ type: 'seek', positionMs: Math.round(preview * 1000) });
    setPreview(null);
  }, [preview, send]);

  return {
    cur: positionMs / 1000,
    dur: durationMs / 1000,
    seekPreview: preview,
    scrubPreview: setPreview,
    scrubCommit,
  };
}
