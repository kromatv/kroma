import { type Direction, Directions } from '@kromatv/spatial-nav';
import { useNavigator } from '@kromatv/spatial-nav/react';
import { type Ref, useImperativeHandle } from 'react';
import type { PanelHandle } from '#ui/components/organisms/player/lib/nav';
import { focusBox, focusSeq } from '#ui/lib/focus-here';
import { remoteConfigured } from '#ui/lib/focus-remote';
import { walkTab } from '#ui/lib/focus-tab';
import type { RemoteKey } from '#ui/lib/remote-keys';

const MOVES: Partial<Record<RemoteKey, Direction>> = {
  Up: Directions.UP,
  Down: Directions.DOWN,
  Left: Directions.LEFT,
  Right: Directions.RIGHT,
  Enter: Directions.ENTER,
};

const PROBE = { seq: focusSeq, box: focusBox };

export interface SheetKeysProps {
  handle: Ref<PanelHandle> | undefined;
  open: boolean;
  onClose: () => void;
}

export function SheetKeys({ handle, open, onClose }: Readonly<SheetKeysProps>) {
  const navigator = useNavigator();
  useImperativeHandle(handle, () => {
    const send = (direction: Direction) => void navigator.handle(direction);
    return {
      onKey: (key: RemoteKey) => {
        if (!open) return false;
        if (key === 'Back') {
          onClose();
          return true;
        }
        const move = MOVES[key];
        if (move && !remoteConfigured()) send(move);
        return true;
      },
      onTab: (backwards: boolean) => {
        if (remoteConfigured()) return true;
        const was = focusSeq();
        walkTab(send, PROBE, backwards);
        return !backwards || focusSeq() !== was;
      },
    };
  }, [open, onClose, navigator]);
  return null;
}
