import type { MediaItem } from '@kromatv/client/media';
import { useMemo } from 'react';
import { usePlayerDock } from '#tv/app/playerDock';
import { useNav } from '#tv/app/router';

export interface DockedPlayer {
  leave(): void;
  home(): void;
  swap(next: MediaItem): void;
  onPipStart(): void;
  onPipStop(playing: boolean): void;
}

/** How the player leaves, changes title and answers its picture-in-picture
 * window. On screen it moves through the stack. Docked behind the window, it
 * ends the session instead of touching the screen the viewer is browsing, and a
 * window closed while the film still plays was expanded, so the player comes
 * back to the front. */
export function useDockedPlayer(item: MediaItem, docked: boolean): DockedPlayer {
  const nav = useNav();
  const dock = usePlayerDock();
  return useMemo<DockedPlayer>(
    () => ({
      leave: docked ? dock.undock : nav.back,
      home: docked ? dock.undock : nav.home,
      swap: (next) => (docked ? dock.undock() : nav.swap('player', { item: next })),
      onPipStart: () => {
        if (!docked) dock.dock(item, nav.back);
      },
      onPipStop: (playing) => {
        if (!docked) return;
        if (playing) nav.go('player', { item });
        else dock.undock();
      },
    }),
    [docked, dock, nav, item],
  );
}
