import type { MediaItem } from '@kromatv/client/media';
import { Box, ConfirmHost, FocusScope, style } from '@kromatv/ui/kit';
import {
  type ComponentType,
  createContext,
  type ReactNode,
  Suspense,
  startTransition,
  use,
  useEffect,
  useMemo,
  useState,
} from 'react';

export interface PlayerDock {
  docked: MediaItem | null;
  dock(item: MediaItem, leave: () => void): void;
  undock(): void;
}

export interface PlayerSlotState {
  item: MediaItem;
  docked: boolean;
}

const DockCtx = createContext<PlayerDock | null>(null);
const SlotCtx = createContext<PlayerSlotState | null>(null);

const SHOWN = style({ fill: true });
const DOCKED = style({ fill: true, opacity: 0 });

/** Holds the film whose player stays mounted behind the screens while its
 * picture plays in the system's picture-in-picture window. */
export function PlayerDockProvider({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  const [docked, setDocked] = useState<MediaItem | null>(null);
  const value = useMemo<PlayerDock>(
    () => ({
      docked,
      dock: (item, leave) =>
        startTransition(() => {
          setDocked(item);
          leave();
        }),
      undock: () => setDocked(null),
    }),
    [docked],
  );
  return <DockCtx value={value}>{children}</DockCtx>;
}

/** The dock. `dock(item, leave)` parks the player and runs `leave` in the same
 * commit, so there is no frame where the route is gone and the dock still empty,
 * which would unmount the player and close its window. */
export function usePlayerDock(): PlayerDock {
  const dock = use(DockCtx);
  if (!dock) throw new Error('usePlayerDock outside a PlayerDockProvider');
  return dock;
}

/** The film the player screen is showing, and whether it is docked out of sight. */
export function usePlayerSlot(): PlayerSlotState {
  const slot = use(SlotCtx);
  if (!slot) throw new Error('usePlayerSlot outside the player slot');
  return slot;
}

/** Where the player screen renders, on screen or docked: one tree position for
 * both, so expanding the window finds the same instance. A player route on top
 * wins over the dock and clears it. */
export function PlayerSlot({
  top,
  Screen,
}: Readonly<{ top: MediaItem | null; Screen: ComponentType }>): ReactNode {
  const { docked, undock } = usePlayerDock();
  useEffect(() => {
    if (top && docked) undock();
  }, [top, docked, undock]);
  const item = top ?? docked;
  const slot = useMemo(() => (item ? { item, docked: top == null } : null), [item, top]);
  if (!slot) return null;
  const key = `player:${slot.item.id}`;
  return (
    <SlotCtx value={slot}>
      <Box
        key={key}
        style={slot.docked ? DOCKED : SHOWN}
        pointerEvents={slot.docked ? 'none' : 'auto'}
        accessibilityElementsHidden={slot.docked}
      >
        <Suspense fallback={slot.docked ? null : <Box fill bg="bg" />}>
          <FocusScope entryKey={key} active={!slot.docked} bridge={!slot.docked}>
            <ConfirmHost>
              <Screen />
            </ConfirmHost>
          </FocusScope>
        </Suspense>
      </Box>
    </SlotCtx>
  );
}
