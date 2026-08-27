import { createRoot } from 'react-dom/client';
import { Devtools } from './devtools';
import { draggable, place } from './drag';
import { readSession, writeSession } from './session';

const HOST_STYLE = {
  position: 'fixed',
  right: '16px',
  bottom: '16px',
  zIndex: '2147483000',
  display: 'flex',
  touchAction: 'none',
} as const;

/** Put the dev tools on the page: a badge in the bottom-right corner that opens
 *  the panel. Its own React root in its own element, so it never joins the
 *  layout it is inspecting. Returns a disposer, and does nothing where there is
 *  no document. */
export function mount(): () => void {
  if (typeof document === 'undefined') return () => {};
  const host = document.createElement('div');
  host.dataset.kromaI18nDevtools = '';
  Object.assign(host.style, HOST_STYLE);
  document.body.append(host);

  const { x, y } = readSession();
  if (x !== null && y !== null) place(host, x, y);
  const stopDrag = draggable(host, (left, top) => writeSession({ x: left, y: top }));

  const root = createRoot(host);
  root.render(<Devtools />);

  return () => {
    stopDrag();
    // A hot reload disposes while React may still be rendering the tree above.
    queueMicrotask(() => {
      root.unmount();
      host.remove();
    });
  };
}
