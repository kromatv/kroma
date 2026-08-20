import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { WEB } from '#ui/lib/platform';

/** How long the reveal waits for a frame before showing the image anyway. */
const REVEAL_FLOOR_MS = 250;

interface CrossFade {
  loaded: boolean;
  errored: boolean;
  under: string | null;
  markLoaded: () => void;
  markErrored: () => void;
}

function useCrossFade(src: string | null, duration: number): CrossFade {
  const [shown, setShown] = useState<string | null>(src);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [under, setUnder] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const settling = useRef<{
    frame: number;
    timer: ReturnType<typeof setTimeout>;
    src: string | null;
  } | null>(null);
  const committed = useRef(src);
  useLayoutEffect(() => {
    committed.current = src;
  }, [src]);
  useEffect(
    () => () => {
      if (!settling.current) return;
      cancelAnimationFrame(settling.current.frame);
      clearTimeout(settling.current.timer);
    },
    [],
  );

  // Adjusted during render, not in an effect: a post-commit update would paint
  // one frame of the new (transparent) image over nothing, which reads as a
  // flicker.
  if (shown !== src) {
    setUnder(src && loadedSrc && loadedSrc !== src ? loadedSrc : null);
    setShown(src);
    setLoaded(false);
    setErrored(false);
  }

  // Drop the underlay once the incoming image has finished fading in over it.
  useEffect(() => {
    if (!loaded || under == null) return;
    const id = setTimeout(() => setUnder(null), duration);
    return () => clearTimeout(id);
  }, [loaded, under, duration]);

  const markLoaded = useEffectEvent(() => {
    // Idempotent per source: React re-invokes the inline `ref` below on every
    // render, so a decoded image reports itself again on each one.
    if (settling.current?.src === src || (loaded && loadedSrc === src)) return;
    setLoadedSrc(src);
    // A CSS transition only runs once the browser has PAINTED the state it
    // starts from, and cached artwork is `complete` in the ref's own commit,
    // so the reveal waits one frame or it cuts instead of fading.
    if (!WEB) {
      setLoaded(true);
      return;
    }
    if (settling.current) {
      cancelAnimationFrame(settling.current.frame);
      clearTimeout(settling.current.timer);
    }
    const settle = () => {
      settling.current = null;
      if (committed.current === src) setLoaded(true);
    };
    const frame = requestAnimationFrame(settle);
    // A hidden tab never runs the frame, and a television decoding video can
    // skip it for seconds; the floor turns that into a cut, not a blank box.
    const timer = setTimeout(settle, REVEAL_FLOOR_MS);
    settling.current = { frame, timer, src };
  });

  const markErrored = useEffectEvent(() => {
    setErrored(true);
    setUnder(null);
  });

  return { loaded, errored, under, markLoaded, markErrored };
}

export { useCrossFade };
