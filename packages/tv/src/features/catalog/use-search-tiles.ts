import type { DiscoverEntry } from '@kromatv/client/discovery';
import { posterColors, qualityBadge, qualityBadgeForVideo } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { useMemo } from 'react';
import { type TvNav, useClient, useNav } from '#tv/app/router';
import type { HeldTitle } from '#tv/features/catalog/TitleMenu';
import type {
  SearchPerson,
  SearchResult,
  SearchSection,
} from '#tv/features/catalog/TvSearchResults';
import type { LibraryHit, SearchAnswers } from '#tv/features/catalog/useSearchAnswers';

// The results grid draws 254pt posters, served from the server's 320 bucket.
const RESULT_W = 320;
const FACE_W = 96;

interface SearchTileHandlers {
  remember: (query: string) => void;
  hold: (title: HeldTitle) => void;
}

interface SearchTiles {
  people: SearchPerson[];
  sections: SearchSection[];
}

interface TileContext extends SearchTileHandlers {
  art: ReturnType<typeof useClient>['media']['artwork'];
  nav: TvNav;
  found: string;
}

type ItemHit = Exclude<LibraryHit, { type: 'show' }>;

function showTile(
  show: Extract<LibraryHit, { type: 'show' }>['show'],
  c: TileContext,
): SearchResult {
  return {
    id: show.id,
    title: show.title,
    badge: qualityBadgeForVideo(show.video),
    poster: c.art.showPosterFor(show, RESULT_W),
    colors: posterColors(show.id),
    onOpen: () => {
      c.remember(c.found);
      c.nav.go('show', { show });
    },
    onLongPress: () => c.hold({ kind: 'show', item: show }),
  };
}

function itemTile(hit: ItemHit, c: TileContext): SearchResult {
  const m = hit.item;
  return {
    id: m.id,
    title: hit.type === 'episode' ? (hit.item.episodeTitle ?? m.title) : m.title,
    badge: qualityBadge(m),
    poster: c.art.posterFor(m, RESULT_W),
    colors: posterColors(m.id),
    onOpen: () => {
      c.remember(c.found);
      c.nav.go('movie', { item: m });
    },
    onLongPress: () =>
      c.hold(
        hit.type === 'episode'
          ? { kind: 'episode', item: hit.item }
          : { kind: 'movie', item: hit.item },
      ),
  };
}

const hitTile = (hit: LibraryHit, c: TileContext) =>
  hit.type === 'show' ? showTile(hit.show, c) : itemTile(hit, c);

const entryTile = (entry: DiscoverEntry, c: TileContext): SearchResult => ({
  id: `tmdb:${entry.tmdbId}`,
  title: entry.title,
  badge: null,
  poster: c.art.resolve(entry.posterUrl, RESULT_W),
  colors: posterColors(String(entry.tmdbId)),
  onOpen: () => {
    c.remember(c.found);
    c.nav.go('discover', { entry });
  },
});

const personTile = (person: SearchAnswers['people'][number], c: TileContext): SearchPerson => ({
  id: `${person.name}:${person.tmdbId ?? ''}`,
  name: person.name,
  photo: c.art.resolve(person.profileUrl, FACE_W),
  titles: person.titles,
  onOpen: () => {
    c.remember(c.found);
    c.nav.go('person', { name: person.name });
  },
});

/** The answers to a search as the tiles the results pane draws. A search
 * "counts" once the viewer opens one of them, and what `remember` is handed is
 * the query that found it, not the prefix left in the box by then. */
export function useSearchTiles(
  answers: SearchAnswers,
  { remember, hold }: SearchTileHandlers,
): SearchTiles {
  const client = useClient();
  const nav = useNav();
  const t = useT();

  return useMemo(() => {
    const { query: found, library, discover, people } = answers;
    const context: TileContext = { art: client.media.artwork, nav, found, remember, hold };

    return {
      people: people.map((person) => personTile(person, context)),
      sections: [
        {
          key: 'library',
          title: t('discover.sectionLibrary'),
          hits: library.map((hit) => hitTile(hit, context)),
        },
        {
          key: 'discover',
          title: t('discover.sectionDiscover'),
          hits: discover
            .filter((entry) => !entry.inLibrary)
            .map((entry) => entryTile(entry, context)),
        },
      ],
    };
  }, [answers, client, nav, t, remember, hold]);
}
