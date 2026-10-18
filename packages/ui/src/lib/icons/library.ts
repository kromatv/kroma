// Optional workbench assets belong to its root; products keep their build subset.
import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useSyncExternalStore,
} from 'react';
import { createIconCatalog, EMPTY_ICON_CATALOG, type IconCatalog } from '#ui/lib/icon-catalog';
import { BUILTIN_GLYPHS, createGlyphSet, type GlyphExports, RAW } from './glyphs';

type IconCatalogLoader = () => Promise<IconCatalog>;
interface IconLibraryOptions {
  glyphs?: GlyphExports;
  catalog?: IconCatalog;
  loadCatalog?: IconCatalogLoader | null;
  loadGlyphs?: (() => Promise<GlyphExports>) | null;
}
const BUILTIN = Object.freeze({ glyphs: BUILTIN_GLYPHS, catalog: EMPTY_ICON_CATALOG, ready: true });
const subscribeNothing = () => () => {};
const readBuiltin = () => BUILTIN;
const ignore = () => undefined;

export function createIconLibrary({
  glyphs,
  catalog,
  loadCatalog = null,
  loadGlyphs = null,
}: IconLibraryOptions = {}) {
  let current = {
    glyphs: glyphs ? createGlyphSet({ ...RAW, ...glyphs }) : BUILTIN_GLYPHS,
    catalog: catalog ? createIconCatalog(catalog) : EMPTY_ICON_CATALOG,
    ready: loadCatalog === null && loadGlyphs === null,
  };
  let fetching: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const read = () => current;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const load = () => {
    if (current.ready) return Promise.resolve();
    fetching ??= Promise.all([
      loadGlyphs
        ? Promise.resolve()
            .then(loadGlyphs)
            .then((more) => {
              current = { ...current, glyphs: createGlyphSet({ ...RAW, ...glyphs, ...more }) };
              notify();
            })
            .catch(ignore)
        : undefined,
      loadCatalog
        ? Promise.resolve()
            .then(loadCatalog)
            .then((more) => {
              current = { ...current, catalog: createIconCatalog(more) };
              notify();
            })
            .catch(ignore)
        : undefined,
    ]).then(() => {
      current = { ...current, ready: true };
      notify();
    });
    return fetching;
  };
  return { read, subscribe, load };
}
export type IconLibrary = ReturnType<typeof createIconLibrary>;
const Context = createContext<IconLibrary | null>(null);
export function IconLibraryProvider({
  library,
  children,
}: {
  library: IconLibrary;
  children: ReactNode;
}) {
  return createElement(Context.Provider, { value: library }, children);
}
export function useIconAssets() {
  const library = useContext(Context);
  return useSyncExternalStore(
    library?.subscribe ?? subscribeNothing,
    library?.read ?? readBuiltin,
    library?.read ?? readBuiltin,
  );
}
export function useIconLibrary(): boolean {
  const library = useContext(Context);
  const { ready } = useIconAssets();
  useEffect(() => {
    void library?.load();
  }, [library]);
  return ready;
}
export type { IconCatalogLoader, IconLibraryOptions };
