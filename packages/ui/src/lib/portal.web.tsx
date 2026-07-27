// <Portal>: render a full-screen overlay outside whatever laid it out.
//
// `position: fixed` is only fixed to the VIEWPORT while no ancestor carries a
// transform, a filter or a perspective - any of those makes itself the
// containing block instead. Both of the kit's full-screen overlays live under
// exactly such an ancestor: `<TvStage>` scales the whole 1920 canvas to the
// window, and the workbench renders a story inside a scaled device frame. The
// brand intro mounted there is not a film over the page, it is a film in a box
// in the middle of the page.
//
// So an overlay that means the whole window says so, and lands at the document
// root where nothing can scale it.

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

function Portal({ children }: Readonly<{ children: ReactNode }>) {
  // No SSR guard by way of a mount effect: this file is only reached in a
  // browser (the SSR shell resolves the native half, which renders inline), and
  // a one-frame delay would be visible on something as time-critical as an
  // intro film.
  if (typeof document === 'undefined') return <>{children}</>;
  return createPortal(children, document.body);
}

export { Portal };
