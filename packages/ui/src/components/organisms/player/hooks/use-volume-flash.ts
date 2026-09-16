import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { StageFlash } from '#ui/components/organisms/player/parts/stage-flash';

const LINGER_MS = 700;

export interface VolumeFlash {
  flash: StageFlash | null;
  /** Show `level` over the picture, and keep showing it while keys keep coming. */
  show(level: number): void;
}

/** The volume echo a keyboard or remote step leaves on the stage. */
export function useVolumeFlash(): VolumeFlash {
  const [flash, setFlash] = useState<StageFlash | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const show = useEffectEvent((level: number) => {
    setFlash({ kind: 'volume', level });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setFlash(null);
    }, LINGER_MS);
  });

  return { flash, show };
}
