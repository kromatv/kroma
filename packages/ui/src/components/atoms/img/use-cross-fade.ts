import { useEffect, useEffectEvent, useState } from 'react';

interface CrossFade {
  loaded: boolean;
  errored: boolean;
  under: string | null;
  markLoaded: () => void;
  markErrored: () => void;
}

interface CrossFadeOptions {
  crossFade: boolean;
  watched: boolean;
}

function useCrossFade(
  src: string | null,
  duration: number,
  { crossFade, watched }: CrossFadeOptions,
): CrossFade {
  const [shown, setShown] = useState<string | null>(src);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [under, setUnder] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

  // Adjusted during render, not in an effect: a post-commit update would paint
  // one frame of the new (transparent) image over nothing, which reads as a
  // flicker.
  if (shown !== src) {
    setUnder(crossFade && src && loadedSrc && loadedSrc !== src ? loadedSrc : null);
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
    if (!crossFade && !watched) return;
    if (loaded && loadedSrc === src) return;
    setLoadedSrc(src);
    setLoaded(true);
  });

  const markErrored = useEffectEvent(() => {
    setErrored(true);
    setUnder(null);
  });

  return { loaded, errored, under, markLoaded, markErrored };
}

export { useCrossFade };
