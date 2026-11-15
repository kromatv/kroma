import type { DiscoverEntry } from '@kromatv/client/discovery';
import { posterColors, qualityBadge, qualityBadgeForVideo } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { useMemo } from 'react';
import { useClient, useNav } from '#tv/app/router';
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
    const art = client.media.artwork;

    const toHit = (hit: LibraryHit): SearchResult => {
      if (hit.type === 'show') {
        const show = hit.show;
        return {
          id: show.id,
          title: show.title,
          badge: qualityBadgeForVideo(show.video),
          poster: art.showPosterFor(show, RESULT_W),
          colors: posterColors(show.id),
          onOpen: () => {
            remember(found);
            nav.go('show', { show });
          },
          onLongPress: () => hold({ kind: 'show', item: show }),
        };
      }
      const m = hit.item;
      return {
        id: m.id,
        title: hit.type === 'episode' ? (hit.item.episodeTitle ?? m.title) : m.title,
        badge: qualityBadge(m),
        poster: art.posterFor(m, RESULT_W),
        colors: posterColors(m.id),
        onOpen: () => {
          remember(found);
          nav.go('movie', { item: m });
        },
        onLongPress: () =>
          hold(
            hit.type === 'episode'
              ? { kind: 'episode', item: hit.item }
              : { kind: 'movie', item: hit.item },
          ),
      };
    };

    const toEntry = (entry: DiscoverEntry): SearchResult => ({
      id: `tmdb:${entry.tmdbId}`,
      title: entry.title,
      badge: null,
      poster: art.resolve(entry.posterUrl, RESULT_W),
      colors: posterColors(String(entry.tmdbId)),
      onOpen: () => {
        remember(found);
        nav.go('discover', { entry });
      },
    });

    return {
      people: people.map((person) => ({
        id: `${person.name}:${person.tmdbId ?? ''}`,
        name: person.name,
        photo: art.resolve(person.profileUrl, FACE_W),
        titles: person.titles,
        onOpen: () => {
          remember(found);
          nav.go('person', { name: person.name });
        },
      })),
      sections: [
        { key: 'library', title: t('discover.sectionLibrary'), hits: library.map(toHit) },
        {
          key: 'discover',
          title: t('discover.sectionDiscover'),
          hits: discover.filter((entry) => !entry.inLibrary).map(toEntry),
        },
      ],
    };
  }, [answers, client, nav, t, remember, hold]);
}
