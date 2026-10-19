import type { KromaClient } from '@kromatv/client';
import { posterColors } from '@kromatv/core';
import type { TvNav } from '#tv/app/router';
import { type CatalogEntry, entryPoster } from '#tv/features/catalog/home/AmbientBackdrop';
import type { GridCard } from '#tv/features/catalog/home/PosterGrid';

export interface EntryCardHandlers {
  client: KromaClient;
  nav: TvNav;
  openMenu: (e: CatalogEntry) => void;
  focus: (id: string) => void;
}

export function entryCard(e: CatalogEntry, on: EntryCardHandlers): GridCard {
  return {
    id: e.item.id,
    title: e.item.title,
    poster: (width: number) => entryPoster(on.client, e, width),
    colors: posterColors(e.item.id),
    progress: e.kind === 'show' ? (e.item.progress ?? null) : null,
    onClick: () =>
      e.kind === 'movie'
        ? on.nav.go('movie', { item: e.item })
        : on.nav.go('show', { show: e.item }),
    onLongPress: () => on.openMenu(e),
    onFocus: () => on.focus(e.item.id),
  };
}
