import { type Direction, Directions } from '@kromatv/spatial-nav';
import { useNavigator } from '@kromatv/spatial-nav/react';
import { type Ref, useImperativeHandle } from 'react';
import type { PanelHandle } from '#ui/components/organisms/player/lib/nav';
import { useFocusServices } from '#ui/lib/focus-services-context';
import { walkTab } from '#ui/lib/focus-tab';
import type { RemoteKey } from '#ui/lib/remote-keys';

const MOVES: Partial<Record<RemoteKey, Direction>> = {
  Up: Directions.UP,
  Down: Directions.DOWN,
  Left: Directions.LEFT,
  Right: Directions.RIGHT,
  Enter: Directions.ENTER,
};

export interface SheetKeysProps {
  handle: Ref<PanelHandle> | undefined;
  open: boolean;
  onClose: () => void;
}

export function SheetKeys({ handle, open, onClose }: Readonly<SheetKeysProps>) {
  const { enabled, probe } = useFocusServices();
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
        if (move && !enabled) send(move);
        return true;
      },
      onTab: (backwards: boolean) => {
        if (enabled) return true;
        const was = probe.seq();
        walkTab(send, probe, backwards);
        return !backwards || probe.seq() !== was;
      },
    };
  }, [open, onClose, navigator, enabled, probe]);
  return null;
}
