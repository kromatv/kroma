import { useCallback, useEffect, useRef, useState } from 'react';

// The scrub half of the seek gesture: `scrub` drives a live preview from an
// absolute position (a mouse click / drag on the progress bar, or the shared
// chrome's scrub) and `commit` issues the seek on release. Only ONE real seek
// is ever issued per gesture, so a drag never rebuffers per-move and lands
// exactly.

export interface SeekDeps {
  duration: () => number;
  seekTo: (absSec: number) => void;
}

export interface SeekGesture {
  preview: number | null;
  scrub: (absSec: number) => void;
  commit: () => void;
}

export function useSeekGesture({ duration, seekTo }: SeekDeps): SeekGesture {
  const [preview, setPreview] = useState<number | null>(null);
  const previewRef = useRef<number | null>(null);
  // Mirrored into a ref so the gesture handlers can read it synchronously.
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
