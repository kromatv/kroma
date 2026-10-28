import type { usePlayerNav } from './hooks/use-player-nav';
import type { PlayerController, PlayerFlags } from './types';

function playerInputHandlers(
  nav: ReturnType<typeof usePlayerNav>,
  c: PlayerController,
  flags: PlayerFlags,
  locked: boolean,
) {
  return {
    onPointerMove: (e: { nativeEvent?: { pointerType?: string } }) => {
      // On a TV (flags.pointer false) a magic-remote cursor emits phantom
      // pointer moves that would keep the chrome pinned open.
      if (flags.pointer && e.nativeEvent?.pointerType !== 'touch') nav.poke();
    },
    onStagePress: () => {
      if (!locked) {
        nav.poke();
        c.togglePlay();
      }
    },
    // A long press is the cross-platform spelling of double-click-to-fullscreen.
    onStageLongPress: () => {
      if (flags.fullscreen) c.toggleFullscreen();
    },
  };
}

export { playerInputHandlers };
