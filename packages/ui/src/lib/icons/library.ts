// What the icon browser needs and a product never does: all of Tabler, and
// Tabler's own metadata about it. Both arrive after the app has started, so the
// chunk it starts from carries neither.

import { useEffect, useState } from 'react';
import { type IconCatalog, setIconCatalog } from '#ui/lib/icon-catalog';
import { everyGlyph } from './every-glyph';
import { addGlyphs } from './glyphs';

/** Fetches Tabler's categories and tags. Only a workbench has them: they are
 * read at build time by `kromaIconCatalog()` (`@kroma/ui/vite/icon-catalog`). */
type IconCatalogLoader = () => Promise<IconCatalog>;

let fetchCatalog: IconCatalogLoader | null = null;
let fetching: Promise<void> | null = null;
let loaded = false;

/** Registers the catalogue, without reading it: a workbench calls this once at
 * startup and the fetch waits for the page that searches by meaning. */
function setIconCatalogLoader(loader: IconCatalogLoader): void {
  fetchCatalog = loader;
  fetching = null;
  loaded = false;
}

/** Whether every glyph this target can draw is drawable now. True wherever
 * there is nothing left to fetch, which is every product build. */
function iconLibraryReady(): boolean {
  return loaded || (everyGlyph === null && fetchCatalog === null);
}

async function fetchLibrary(): Promise<void> {
  const [glyphs, catalog] = await Promise.all([everyGlyph?.(), fetchCatalog?.()]);
  if (glyphs) addGlyphs(glyphs);
  if (catalog) setIconCatalog(catalog);
}

function settled(): void {
  loaded = true;
}

/** Widens the drawable set to all of Tabler and loads the catalogue, once per
 * session. Never rejects: a chunk that fails to arrive leaves the glyphs the
 * build kept, which is a smaller gallery rather than a page that never opens. */
function loadIconLibrary(): Promise<void> {
  if (iconLibraryReady()) return Promise.resolve();
  fetching ??= fetchLibrary().then(settled, settled);
  return fetching;
}

/** The library's arrival, for a page that has to wait for it. The fetch starts
 * on the first render that asks. */
function useIconLibrary(): boolean {
  const [ready, setReady] = useState(iconLibraryReady);
  useEffect(() => {
    if (ready) return;
    let live = true;
    loadIconLibrary().then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, [ready]);
  return ready;
}

export type { IconCatalogLoader };
export { iconLibraryReady, loadIconLibrary, setIconCatalogLoader, useIconLibrary };
