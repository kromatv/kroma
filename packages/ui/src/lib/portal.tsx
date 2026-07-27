// <Portal>: render a full-screen overlay outside whatever laid it out.
//
// Native has no equivalent problem to solve - a React Native view tree has no
// `position: fixed`, no clipping ancestor that escapes the screen, and the
// screens that show an overlay already mount it at their root - so here it is
// the identity component. The web half is where the work is; see `portal.web`.

import type { ReactNode } from 'react';

/** Renders `children` where they are. See `portal.web.tsx`. */
function Portal({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>;
}

export { Portal };
