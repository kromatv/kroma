import { createContext, type ReactNode, type RefObject, useContext, useRef } from 'react';

const FrameContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

/** The element the player asks fullscreen of. A route that plays one item after
 *  another mounts it above the player, so the next item starts inside it. */
export function FullscreenFrame({ children }: Readonly<{ children: ReactNode }>) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref}>
      <FrameContext.Provider value={ref}>{children}</FrameContext.Provider>
    </div>
  );
}

/** The enclosing {@link FullscreenFrame}, or null outside one. */
export function useFullscreenFrame(): RefObject<HTMLDivElement | null> | null {
  return useContext(FrameContext);
}
