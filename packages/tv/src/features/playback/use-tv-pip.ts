import { useCallback, useMemo, useRef, useState } from 'react';
import type { PipBinding, PipHandle } from '#tv/features/playback/player/playbackBackend';

export interface TvPip {
  active: boolean;
  toggle(): void;
  binding: PipBinding;
}

/** One player's picture-in-picture: the chrome's toggle, and the binding its
 * surface reports the system window opening and closing through. A request the
 * system refuses leaves the state where it was. */
export function useTvPip(onStart: () => void, onStop: (playing: boolean) => void): TvPip {
  const view = useRef<PipHandle | null>(null);
  const [active, setActive] = useState(false);
  const toggle = useCallback(() => {
    const handle = view.current;
    if (!handle) return;
    const request = active ? handle.stopPictureInPicture() : handle.startPictureInPicture();
    request.catch(() => undefined);
  }, [active]);
  const binding = useMemo<PipBinding>(
    () => ({
      attach: (handle) => {
        view.current = handle;
      },
      onStart: () => {
        setActive(true);
        onStart();
      },
      onStop: (playing) => {
        setActive(false);
        onStop(playing);
      },
    }),
    [onStart, onStop],
  );
  return { active, toggle, binding };
}
