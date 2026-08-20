import type { RemoteKey } from '@kroma/core';
import type { Dispatch, SetStateAction } from 'react';
import type { usePlayerNav } from './hooks/use-player-nav';
import type { PlayerController, PlayerFlags } from './types';

function handleCreditsKey(
  key: RemoteKey,
  focus: 'play' | 'cancel',
  setFocus: Dispatch<SetStateAction<'play' | 'cancel'>>,
  onPlay: () => void,
  onCancel: () => void,
): boolean {
  if (key === 'Left' || key === 'Right') {
    setFocus((f) => (f === 'play' ? 'cancel' : 'play'));
    return true;
  }
  if (key === 'Enter') {
    if (focus === 'play') onPlay();
    else onCancel();
    return true;
  }
  if (key === 'Back') {
    onCancel();
    return true;
  }
  return false;
}

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

export { handleCreditsKey, playerInputHandlers };
