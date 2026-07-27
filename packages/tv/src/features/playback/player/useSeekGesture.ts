import { useCallback, useEffect, useRef, useState } from 'react';

// The scrub half of the seek gesture: `scrub` drives a live preview from an
// absolute position (a mouse click / drag on the progress bar, or the shared
// chrome's scrub) and `commit` issues the seek on release. Only ONE real seek
// is ever issued per gesture, so a drag never rebuffers per-move and lands
// exactly.

export interface SeekDeps {
  /** Total runtime (s), 0 when unknown. */
  duration: () => number;
  /** Commit a real, clamped seek to an absolute position (s). */
  seekTo: (absSec: number) => void;
}

export interface SeekGesture {
  /** Pending absolute target (s) during a drag, else null. */
  preview: number | null;
  /** Live-preview an absolute position while clicking / dragging the scrub bar. */
  scrub: (absSec: number) => void;
  /** Commit the current preview (scrub-bar release / click). */
  commit: () => void;
}

export function useSeekGesture({ duration, seekTo }: SeekDeps): SeekGesture {
  const [preview, setPreview] = useState<number | null>(null);
  const previewRef = useRef<number | null>(null);
  // Mirror the preview into a ref (read synchronously by the gesture handlers)
  // whenever we update the state.
  const updatePreview = useCallback((v: number | null) => {
    previewRef.current = v;
    setPreview(v);
  }, []);

  const clamp = useCallback(
    (t: number) => {
      const total = duration();
      return Math.max(0, total > 0 ? Math.min(total - 1, t) : t);
    },
    [duration],
  );

  const commit = useCallback(() => {
    const target = previewRef.current;
    updatePreview(null);
    if (target != null) seekTo(target);
  }, [seekTo, updatePreview]);

  const scrub = useCallback(
    (absSec: number) => updatePreview(clamp(absSec)),
    [clamp, updatePreview],
  );

  // Flush a pending seek if the player unmounts mid-gesture.
  useEffect(
    () => () => {
      const target = previewRef.current;
      if (target != null) seekTo(target);
    },
    [seekTo],
  );

  return { preview, scrub, commit };
}
