// Who holds the television's focus while a platform chrome (tvOS's own search
// field and keyboard) is on screen: two engines cannot both own the ring, so
// the chrome says which one does and the scope answers. Its own module for the
// same reason as focus-presence: the scope and the chrome both reach it without
// importing each other.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/** Which engine holds the ring: the television's own, or the navigator. */
type FocusOwner = 'platform' | 'app';

/** A direction the navigator handled with nowhere to move. */
type FocusDirection = 'up' | 'down' | 'left' | 'right';

type EdgeHandler = (direction: FocusDirection) => void;

interface PlatformFocusHost {
  claim: (owner: FocusOwner | null) => void;
  listen: (handler: EdgeHandler | null) => void;
}

const PlatformFocus = createContext<PlatformFocusHost | null>(null);

/** Wrap a screen's children in this via <FocusScope>; never directly. */
const PlatformFocusProvider = PlatformFocus.Provider;

/**
 * Declared by a platform chrome drawn inside a scope. `owner` is who holds the
 * television's focus right now, null while no chrome is up. `onEdge` hears the
 * directions the navigator could not act on, which is how a chrome takes the
 * focus back when the ring is already against its side of the screen.
 */
function usePlatformFocus(owner: FocusOwner | null, onEdge?: EdgeHandler): void {
  const host = useContext(PlatformFocus);
  useEffect(() => {
    host?.claim(owner);
    return () => host?.claim(null);
  }, [host, owner]);
  useEffect(() => {
    host?.listen(onEdge ?? null);
    return () => host?.listen(null);
  }, [host, onEdge]);
}

interface PlatformFocusState {
  owner: FocusOwner | null;
  /** For <SpatialNavigationRoot>, whose directions are wider than the four a
   *  chrome is told about. */
  onEdge: (direction: string) => void;
  host: PlatformFocusHost;
}

/** The <FocusScope> half: what the scope renders around, and the value it
 * provides to whatever chrome is drawn inside it. */
function usePlatformFocusHost(): PlatformFocusState {
  const [owner, setOwner] = useState<FocusOwner | null>(null);
  // A ref, not state: a chrome's handler is usually an inline closure, and a
  // scope that re-rendered on every one of them would rebuild the navigator.
  const edge = useRef<EdgeHandler | null>(null);
  const host = useMemo<PlatformFocusHost>(
    () => ({
      claim: setOwner,
      listen: (handler) => {
        edge.current = handler;
      },
    }),
    [],
  );
  const onEdge = useCallback((direction: string) => {
    const arrow = ARROWS[direction];
    if (arrow) edge.current?.(arrow);
  }, []);
  return { owner, onEdge, host };
}

const ARROWS: Record<string, FocusDirection | undefined> = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
};

export type { FocusDirection, FocusOwner };
export { PlatformFocusProvider, usePlatformFocus, usePlatformFocusHost };
