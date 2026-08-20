import type { RemoteKey } from '@kroma/core';
import type { Dispatch, SetStateAction } from 'react';
import type { PlayerNavActions } from '#ui/components/organisms/player/hooks/use-player-nav';
import type { ControlId, Overlay, Zone } from './nav';

interface DpadContext {
  a: PlayerNavActions;
  zone: Zone;
  focused: ControlId | undefined;
  controlsLen: number;
  setZone: Dispatch<SetStateAction<Zone>>;
  setControlIndex: Dispatch<SetStateAction<number>>;
  setRevealed: Dispatch<SetStateAction<boolean>>;
  clearHide: () => void;
  openOverlay: (o: Exclude<Overlay, null>) => void;
  activate: (id: ControlId) => void;
}

function handleMediaKey(key: RemoteKey, a: PlayerNavActions): boolean {
  switch (key) {
    case 'Play':
    case 'Pause':
    case 'PlayPause':
      a.togglePlay();
      return true;
    case 'Next':
      a.onNext();
      return true;
    case 'Prev':
    case 'Rewind':
      a.seekNudge(-1);
      return true;
    case 'FastForward':
      a.seekNudge(1);
      return true;
    case 'Stop':
      a.onExit('stop');
      return true;
    default:
      return false;
  }
}

function dpadUp(ctx: DpadContext): void {
  const { a, zone, focused } = ctx;
  if (zone === 'controls') {
    if (focused === 'volume') {
      a.volumeNudge(1);
      return;
    }
    ctx.setZone('progress');
  } else if (zone === 'progress') {
    ctx.setZone('back');
  } else {
    // Above the Back button there is nothing left to focus, so ▲ dismisses the
    // chrome, which is what it did from `progress` before this zone existed.
    ctx.clearHide();
    ctx.setRevealed(false);
  }
}

function dpadDown(ctx: DpadContext): void {
  const { a, zone, focused } = ctx;
  if (zone === 'back') ctx.setZone('progress');
  else if (zone === 'progress') ctx.setZone('controls');
  else if (focused === 'volume') a.volumeNudge(-1);
  else ctx.openOverlay('sheet');
}

function handleDpadKey(key: RemoteKey, ctx: DpadContext): void {
  const { a, zone, focused } = ctx;
  switch (key) {
    case 'Up':
      dpadUp(ctx);
      return;
    case 'Down':
      dpadDown(ctx);
      return;
    case 'Left':
      if (zone === 'progress') a.seekNudge(-1);
      else ctx.setControlIndex((i) => Math.max(0, i - 1));
      return;
    case 'Right':
      if (zone === 'progress') a.seekNudge(1);
      else ctx.setControlIndex((i) => Math.min(ctx.controlsLen - 1, i + 1));
      return;
    case 'Enter':
      if (zone === 'back') a.onExit('close');
      else if (zone === 'progress') a.togglePlay();
      else if (focused) ctx.activate(focused);
      return;
    case 'Back':
      a.onExit('back');
      return;
  }
}

export { handleDpadKey, handleMediaKey };
