// Renders a full-screen overlay at the document root: `position: fixed` is only
// fixed to the VIEWPORT while no ancestor carries a transform, a filter or a
// perspective, and the kit's overlays sit under a scaled `<TvStage>`.

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

function Portal({ children }: Readonly<{ children: ReactNode }>) {
  // No mount-effect SSR guard: the one-frame delay would show on an intro film.
  if (typeof document === 'undefined') return <>{children}</>;
  return createPortal(children, document.body);
}

export { Portal };
