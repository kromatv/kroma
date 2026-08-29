// Renders a full-screen overlay at the document root: `position: fixed` is only
// fixed to the VIEWPORT while no ancestor carries a transform, a filter or a
// perspective, and the kit's overlays sit under a scaled `<TvStage>`.

import { createContext, type ReactNode, useContext } from 'react';
import { createPortal } from 'react-dom';

const Container = createContext<Element | null>(null);

function Portal({ children }: Readonly<{ children: ReactNode }>) {
  const container = useContext(Container);
  // No mount-effect SSR guard: the one-frame delay would show on an intro film.
  if (typeof document === 'undefined') return <>{children}</>;
  return createPortal(children, container ?? document.body);
}

/**
 * Send the portals opened under it into `container` instead of `<body>`.
 *
 * For a React root that is not the app's: a tool mounted beside the page in its
 * own element stacks above it, and a popover that left for `<body>` would be
 * painted underneath the thing that opened it. `null` is the document, which is
 * what every shell wants and what a portal does with no host above it.
 */
function PortalHost({
  container,
  children,
}: Readonly<{ container: Element | null; children: ReactNode }>) {
  return <Container.Provider value={container}>{children}</Container.Provider>;
}

export { Portal, PortalHost };
