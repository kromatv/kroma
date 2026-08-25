import { metaLine, posterColors, type Section } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Badge, Box, Button, gradient, Row, Text } from '@kroma/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import { type CSSProperties, memo } from 'react';
import { VirtualTileGrid } from '#web/features/catalog/virtual-tile-grid';
import type { MovieView, ShowView } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { useMyList } from '#web/shared/lib/mylist';
import type { HeroEntry } from '#web/shared/lib/queries';
import { useWatched } from '#web/shared/lib/watched';
import { Image, Poster, PosterRail } from '#web/shared/ui';

type HeroBadge = '4K' | 'HDR' | 'H.265';

function heroBadges(v: MovieView['video']): HeroBadge[] {
  if (!v) return [];
  const out: HeroBadge[] = [];
  if ((v.width ?? 0) >= 3840) out.push('4K');
  if (v.hdr) out.push('HDR');
  if (v.codec === 'hevc') out.push('H.265');
  return out;
}

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

// Bled to the content edges (cancels the page gutter) and faded into the rails
// below. The gutter is a fluid CSS custom property, which no style number can
// carry, so the frame stays a plain element.
const HERO: CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  overflow: 'hidden',
  marginLeft: 'calc(var(--gutter-web) * -1)',
  marginRight: 'calc(var(--gutter-web) * -1)',
  marginTop: -36,
  marginBottom: 32,
  minHeight: 'clamp(200px, 52vw, 460px)',
  paddingLeft: 'var(--gutter-web)',
  paddingRight: 'var(--gutter-web)',
  paddingTop: 'clamp(40px, 5vw, 64px)',
  paddingBottom: 40,
};

const HERO_BREATHE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  animation: 'kroma-breathe 7s var(--ease-out) infinite',
  background:
    'radial-gradient(58% 68% at 72% 32%, color-mix(in srgb, var(--kroma-accent-wash) 16%, transparent), transparent 62%)',
};

const HERO_SCRIM = gradient(
  [
    'linear-gradient(90deg, var(--kroma-bg) 6%,',
    'color-mix(in srgb, var(--kroma-bg) 35%, transparent) 42%, transparent 64%),',
    'linear-gradient(0deg, var(--kroma-bg) 2%, transparent 46%)',
  ].join(' '),
);

/** Full-bleed featured banner TMDB backdrop as cinematic art, bled to the
 * content edges (cancels the page gutter) and faded into the rails below. */
export function Hero({ entry }: Readonly<{ entry: HeroEntry }>) {
  const t = useT();
  const navigate = useNavigate();
  const media = entry.type === 'movie' ? entry.movie : entry.show;
  const colors = posterColors(media.id);
  const gradient = `linear-gradient(158deg, ${colors[0]}, ${colors[1]})`;
  const meta = media.metadata;
  const badges = heroBadges(media.video);
  const line =
    entry.type === 'movie'
      ? metaLine(entry.movie)
      : [entry.show.year, t('content.seasonCount', { count: entry.show.seasonCount })]
          .filter(Boolean)
          .join(' · ');

  return (
    <div style={HERO}>
      <Image src={media.backdrop} fit="cover" position="center 18%" background={gradient} fill />
      <div style={HERO_BREATHE} />
      <Box fill pointerEvents="none" style={HERO_SCRIM} />

      <Box maxW={680}>
        <Text variant="overline" color="accent" mb={14}>
          {t('content.featured')}
        </Text>
        <Text variant="hero" mb={14}>
          {media.title}
        </Text>
        <Row wrap gap={12} mb={16}>
          {meta?.rating ? (
            <Text variant="meta" color="accent">{`${meta.rating.toFixed(1)}★`}</Text>
          ) : null}
          <Text variant="meta" color="textMuted">
            {line}
          </Text>
          {badges.map((b) => (
            <Badge key={b} tone={b}>
              {b}
            </Badge>
          ))}
        </Row>
        {meta?.overview ? (
          <Text variant="body" lines={3} maxW={540} mb={20}>
            {meta.overview}
          </Text>
        ) : null}
        <Row wrap gap={14}>
          {entry.type === 'movie' ? (
            <>
              <Button
                label={t('content.play')}
                onPress={() => navigate({ to: '/watch/$id', params: { id: media.id } })}
              />
              <Button
                variant="glass"
                label={t('content.moreInfo')}
                onPress={() => navigate({ to: '/movie/$id', params: { id: media.id } })}
              />
            </>
          ) : (
            <Button
              label={t('content.moreInfo')}
              onPress={() => navigate({ to: '/show/$id', params: { id: media.id } })}
            />
          )}
        </Row>
      </Box>
    </div>
  );
}

// Cards are memo()d: a home page renders hundreds of them, and without memo any
// parent state change (hover, a poll refetch, router transitions) re-renders every card.
export const MoviePoster = memo(function MoviePoster({
  item,
  width,
}: Readonly<{ item: MovieView; width?: number }>) {
  const t = useT();
  const navigate = useNavigate();
  const { isWatched, toggleWatched } = useWatched();
  const { inList, toggle: toggleList } = useMyList();
  return (
    <Poster
      title={item.title}
      genre={t('content.film')}
      colors={posterColors(item.id)}
      poster={item.poster}
      width={width}
      watched={isWatched(item.id)}
      onToggleWatched={() => toggleWatched(item.id)}
      inList={inList(item.id)}
      onToggleList={() => toggleList(item.id)}
      onClick={() => navigate({ to: '/movie/$id', params: { id: item.id } })}
    />
  );
});

export const ShowPoster = memo(function ShowPoster({
  show,
  width,
}: Readonly<{ show: ShowView; width?: number }>) {
  const t = useT();
  const navigate = useNavigate();
  const { isWatched, toggleWatched } = useWatched();
  const { inList, toggle: toggleList } = useMyList();
  return (
    <Poster
      title={show.title}
      genre={t('content.seasonCount', { count: show.seasonCount })}
      colors={posterColors(show.id)}
      poster={show.poster}
      width={width}
      progress={show.progress ?? null}
      watched={isWatched(show.id)}
      onToggleWatched={() => toggleWatched(show.id)}
      inList={inList(show.id)}
      onToggleList={() => toggleList(show.id)}
      onClick={() => navigate({ to: '/show/$id', params: { id: show.id } })}
    />
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
  const navigate = useNavigate();
  const { client } = useAuth();
  const { isWatched, toggleWatched } = useWatched();
  const { inList, toggle: toggleList } = useMyList();
  if (entry.type === 'show') {
    const { show } = entry;
    return (
      <Poster
        title={show.title}
        genre={show.metadata?.genres?.[0] ?? t('content.series')}
        colors={posterColors(show.id)}
        poster={client.showPosterFor(show)}
        width={width}
        progress={show.progress ?? null}
        watched={isWatched(show.id)}
        onToggleWatched={() => toggleWatched(show.id)}
        inList={inList(show.id)}
        onToggleList={() => toggleList(show.id)}
        onClick={() => navigate({ to: '/show/$id', params: { id: show.id } })}
      />
    );
  }
  const { item } = entry;
  const isEpisode = item.kind === 'episode' && !!item.showId;
  return (
    <Poster
      title={item.title}
      genre={item.metadata?.genres?.[0] ?? t(isEpisode ? 'content.series' : 'content.film')}
      colors={posterColors(item.id)}
      poster={client.posterFor(item)}
      width={width}
      watched={isWatched(item.id)}
      onToggleWatched={() => toggleWatched(item.id)}
      inList={inList(item.id)}
      onToggleList={() => toggleList(item.id)}
      onClick={() =>
        isEpisode
          ? navigate({ to: '/show/$id', params: { id: item.showId ?? item.id } })
          : navigate({ to: '/movie/$id', params: { id: item.id } })
      }
    />
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

export function MovieGrid({ movies }: Readonly<{ movies: MovieView[] }>) {
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
export type CatalogEntry = { kind: 'movie'; movie: MovieView } | { kind: 'show'; show: ShowView };

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
