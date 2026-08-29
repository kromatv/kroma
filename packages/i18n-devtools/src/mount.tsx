import { PortalHost } from '@kroma/ui/kit';
import { createRoot, type Root } from 'react-dom/client';
import { bindEngine } from './engine/bind';
import { type Engine, setEngine } from './engine/engine';
import { DEVTOOL, ignoreTools } from './overlay/highlight';
import { Devtools } from './panel/devtools';
import { draggable, EDGE_PX, keepInView, place } from './panel/drag';
import { type Channel, openChannel } from './server/host';
import { readSession, writeSession } from './session';

const HOST = `[${DEVTOOL}="i18n"]`;
const LIVE = '__kromaI18nDevtoolsDispose';

export interface MountOptions {
  /** Selectors for overlays that cannot wear `data-kroma-devtool` themselves. */
  ignore?: readonly string[];
  /** The dev server to ask, which only the module the plugin injects has. */
  hot?: Channel | null;
  /** The engine to inspect. Without one the tools draw but report nothing. */
  engine?: Engine;
}

const HOST_STYLE = {
  position: 'fixed',
  right: `${EDGE_PX}px`,
  bottom: `${EDGE_PX}px`,
  zIndex: '2147483000',
  display: 'flex',
  touchAction: 'none',
} as const;

function disposeLive(): void {
  for (const stale of document.querySelectorAll(HOST)) {
    const dispose = Reflect.get(stale, LIVE);
    if (typeof dispose === 'function') dispose();
    else stale.remove();
  }
}

// React stamps a root container's document as listening, and a shell that
// renders `<html>` itself then hydrates an already-stamped document and
// attaches none of its delegated listeners - which leaves the whole app deaf to
// clicks. Nothing here needs that stamp: the panel's own container carries the
// listeners it uses, so whichever root gets there first, the page keeps its own.
function stamps(): string[] {
  return Object.keys(document).filter((key) => key.startsWith('_reactListening'));
}

function leaveDocumentUnstamped(before: readonly string[]): void {
  for (const key of stamps()) {
    if (!before.includes(key)) Reflect.deleteProperty(document, key);
  }
}

/**
 * Put the dev tools on the page: a badge in the bottom-right corner that opens
 * the panel. Returns a disposer, and does nothing where there is no document.
 *
 * Its own React root in its own element, created one task late so the shell
 * claims the document first, and giving back the stamp above so it
 * does not matter if the shell is later still. It also takes down whatever it
 * finds already running: a hot update inside this package re-runs the module
 * that calls this without ever reaching that module's own disposer.
 */
export function mount(options: MountOptions = {}): () => void {
  if (typeof document === 'undefined') return () => {};
  ignoreTools(options.ignore ?? []);
  openChannel(options.hot ?? null);
  setEngine(options.engine ?? null);
  const unbind = bindEngine();
  disposeLive();

  const host = document.createElement('div');
  host.setAttribute(DEVTOOL, 'i18n');
  Object.assign(host.style, HOST_STYLE);
  document.body.append(host);

  const { open, x, y } = readSession();
  if (open && x !== null && y !== null) place(host, x, y);
  const stopDrag = draggable(host, (left, top) => writeSession({ x: left, y: top }));
  const stopClamp = keepInView(host);

  let root: Root | null = null;
  const start = setTimeout(() => {
    const before = stamps();
    root = createRoot(host);
    root.render(
      <PortalHost container={host}>
        <Devtools host={host} />
      </PortalHost>,
    );
    leaveDocumentUnstamped(before);
  });

  const dispose = () => {
    unbind();
    clearTimeout(start);
    stopClamp();
    stopDrag();
    // A hot reload disposes while React may still be rendering the tree above.
    queueMicrotask(() => {
      root?.unmount();
      host.remove();
    });
  };
  Reflect.set(host, LIVE, dispose);
  return dispose;
}
