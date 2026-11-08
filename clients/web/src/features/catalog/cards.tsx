import type { Section } from '@kromatv/client/media';
import { genreLabels, posterColors } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Text } from '@kromatv/ui/kit';
import { memo } from 'react';
import { VirtualTileGrid } from '#web/features/catalog/virtual-tile-grid';
import type { MovieCardView, ShowView } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { useMyList } from '#web/shared/lib/mylist';
import { useWatched } from '#web/shared/lib/watched';
import { Poster, PosterRail } from '#web/shared/ui';
import { RouteLink } from '#web/shared/ui/route-link';

/** The title above a home rail. Still an `<h2>`: `<Text accessibilityRole>` can
 *  only render an `h1`. */
export function SectionHeading({ children }: Readonly<{ children: string }>) {
  return (
    <h2>
      <Text variant="h2" mt={40} mb={20}>
        {children}
      </Text>
    </h2>
  );
}

// Cards are memo()d: a home page renders hundreds of them, and without memo any
// parent state change (hover, a poll refetch, router transitions) re-renders every card.
export const MoviePoster = memo(function MoviePoster({
  item,
  width,
  caption,
}: Readonly<{ item: MovieCardView; width?: number; caption?: boolean }>) {
  const t = useT();
  const { isWatched, toggleWatched } = useWatched();
  const { inList, toggle: toggleList } = useMyList();
  return (
    <Poster
      title={item.title}
      genre={t('content.film')}
      colors={posterColors(item.id)}
      poster={item.poster}
      width={width}
      caption={caption}
      watched={isWatched(item.id)}
      onToggleWatched={() => toggleWatched(item.id)}
      inList={inList(item.id)}
      onToggleList={() => toggleList(item.id)}
      asChild
    >
      <RouteLink to="/movies/$id" params={{ id: item.id }} />
    </Poster>
  );
});

export const ShowPoster = memo(function ShowPoster({
  show,
  width,
  caption,
}: Readonly<{ show: ShowView; width?: number; caption?: boolean }>) {
  const t = useT();
  const { isWatched, toggleWatched } = useWatched();
  const { inList, toggle: toggleList } = useMyList();
  return (
    <Poster
      title={show.title}
      genre={t('content.seasonCount', { count: show.seasonCount })}
      colors={posterColors(show.id)}
      poster={show.poster}
      width={width}
      caption={caption}
      progress={show.progress ?? null}
      watched={isWatched(show.id)}
      onToggleWatched={() => toggleWatched(show.id)}
      inList={inList(show.id)}
      onToggleList={() => toggleList(show.id)}
      asChild
    >
      <RouteLink to="/shows/$id" params={{ id: show.id }} />
    </Poster>
  );
});

type SectionEntry = Section['items'][number];

/** Same watched badge + show-progress affordances as the catalogue grids, so the
 * home rows and the "Suggestions IA" rail stay visually consistent with them. */
export const SectionPoster = memo(function SectionPoster({
  entry,
  width,
}: Readonly<{ entry: SectionEntry; width?: number }>) {
  const t = useT();
  const { client } = useAuth();
  const { isWatched, toggleWatched } = useWatched();
  const { inList, toggle: toggleList } = useMyList();
  if (entry.type === 'show') {
    const { show } = entry;
    return (
      <Poster
        title={show.title}
        genre={genreLabels(t, show.metadata)[0] ?? t('content.series')}
        colors={posterColors(show.id)}
        poster={client.media.artwork.showPosterFor(show)}
        width={width}
        progress={show.progress ?? null}
        watched={isWatched(show.id)}
        onToggleWatched={() => toggleWatched(show.id)}
        inList={inList(show.id)}
        onToggleList={() => toggleList(show.id)}
        asChild
      >
        <RouteLink to="/shows/$id" params={{ id: show.id }} />
      </Poster>
    );
  }
  const { item } = entry;
  const isEpisode = item.kind === 'episode' && !!item.showId;
  return (
    <Poster
      title={item.title}
      genre={genreLabels(t, item.metadata)[0] ?? t(isEpisode ? 'content.series' : 'content.film')}
      colors={posterColors(item.id)}
      poster={client.media.artwork.posterFor(item)}
      width={width}
      watched={isWatched(item.id)}
      onToggleWatched={() => toggleWatched(item.id)}
      inList={inList(item.id)}
      onToggleList={() => toggleList(item.id)}
      asChild
    >
      {isEpisode ? (
        <RouteLink to="/shows/$id" params={{ id: item.showId ?? item.id }} />
      ) : (
        <RouteLink to="/movies/$id" params={{ id: item.id }} />
      )}
    </Poster>
  );
});

export function ShowRail({ title, shows }: Readonly<{ title: string; shows: ShowView[] }>) {
  if (shows.length === 0) return null;
  return (
    <section>
      <SectionHeading>{title}</SectionHeading>
      <PosterRail data={shows} renderItem={(show) => <ShowPoster show={show} />} />
    </section>
  );
}

export function MovieGrid({ movies }: Readonly<{ movies: MovieCardView[] }>) {
  return (
    <VirtualTileGrid
      data={movies}
      keyOf={(item) => item.id}
      renderItem={(item, width) => <MoviePoster item={item} width={width} />}
    />
  );
}

export function ShowGrid({ shows }: Readonly<{ shows: ShowView[] }>) {
  return (
    <VirtualTileGrid
      data={shows}
      keyOf={(show) => show.id}
      renderItem={(show, width) => <ShowPoster show={show} width={width} />}
    />
  );
}

/** A movie or a show, tagged so a mixed list (e.g. one person's filmography)
 * renders each tile with the right poster + navigation. */
export type CatalogEntry =
  | { kind: 'movie'; movie: MovieCardView }
  | { kind: 'show'; show: ShowView };

/** A grid mixing movies and shows in the given order (server-ranked). */
export function CatalogGrid({ entries }: Readonly<{ entries: CatalogEntry[] }>) {
  return (
    <VirtualTileGrid
      data={entries}
      keyOf={(e) => (e.kind === 'movie' ? e.movie.id : e.show.id)}
      renderItem={(e, width) =>
        e.kind === 'movie' ? (
          <MoviePoster item={e.movie} width={width} />
        ) : (
          <ShowPoster show={e.show} width={width} />
        )
      }
    />
  );
}
