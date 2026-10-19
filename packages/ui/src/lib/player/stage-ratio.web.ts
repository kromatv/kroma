// A television shell draws its chrome on a 1920x1080 canvas and CSS-scales the
// whole thing into whatever window it was given, so the window's shape is NOT
// the stage's: fitted into a short wide window the canvas keeps its own ratio
// and the window keeps a surround. The picture is letterboxed against the stage,
// so the stage is what gets measured. A transform does not change a ratio, so
// the on-screen box answers for the layout box.
//
// Measured here rather than through `onLayout`, which is a ResizeObserver under
// react-native-web: that first value only arrives with a frame, and the legacy
// television tier ships no polyfill for it at all (see lib/metrics). The read
// below is synchronous, so the first paint already has the picture's shape, and
// the observer is only there to keep it honest afterwards - a scrollbar arriving
// resizes the stage without resizing the window.
//
// The element is looked up again on every read: the stage can be remounted under
// us, and a held reference would go on measuring a detached node.

import { useEffect, useState } from 'react';
import { webDocument, webWindow } from '#ui/lib/dom';

function ratioOf(stageId: string): number | null {
  const node = webDocument()?.getElementById(stageId);
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return rect.height > 0 ? rect.width / rect.height : null;
}

/** The stage's width / height, read off the element the chrome draws on. */
export function useStageRatio(stageId: string, measured: number): number {
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    const win = webWindow();
    const read = () => {
      const next = ratioOf(stageId);
      if (next != null) {
        setRatio((prev) => (prev != null && Math.abs(prev - next) < 1e-4 ? prev : next));
      }
    };
    read();
    win?.addEventListener('resize', read);
    const node = webDocument()?.getElementById(stageId);
    const observer =
      node && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    observer?.observe(node as Element);
    return () => {
      win?.removeEventListener('resize', read);
      observer?.disconnect();
    };
  }, [stageId]);
  return ratio ?? measured;
}
