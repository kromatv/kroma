import type { CardSection } from '@kromatv/client/media';
import { recordingClient } from '@kromatv/client/test';
import { describe, expect, it } from 'vitest';
import { movieCard, movieEntry, showCard, showEntry } from './home-entry.fixture';
import {
  drawsClientMyList,
  entryBackdrop,
  entryId,
  entryRoute,
  entryTitle,
  featuredFallback,
  type HomeEntry,
  type HomeRow,
  planHome,
  servesHero,
} from './home-sections';

const movie = (id: string) => movieEntry(id);
const show = (id: string) => showEntry(id);

const section = (id: string, items: HomeEntry[], over: Partial<CardSection> = {}): CardSection => ({
  id,
  title: id,
  layout: 'rail',
  notes: {},
  items,
  ...over,
});

const ids = (row: HomeRow | null) => (row?.entries ?? []).map(({ entry }) => entryId(entry));

describe('entryTitle', () => {
  it('prefers the name the catalogue matched over the one the file gave', () => {
    const entry = movieEntry('a', { title: 'heat.1995', matched: 'Heat' });

    expect(entryTitle(entry)).toBe('Heat');
  });

  it('falls back to the name of an unmatched title', () => {
    const entry = showEntry('a', { title: 'Severance' });

    expect(entryTitle(entry)).toBe('Severance');
  });
});

describe('entryBackdrop', () => {
  const { client } = recordingClient();
  const { artwork } = client.media;

  it('draws a title on its backdrop', () => {
    const entry = movieEntry('a', { backdrop: '/api/images/b.webp' });

    expect(entryBackdrop(entry, client)).toBe('http://kroma.test/api/images/b.webp');
  });

  it('falls back to the poster of a title that has no backdrop', () => {
    const film = movieCard('a');
    const series = showCard('b');

    expect(entryBackdrop({ type: 'movie', item: film }, client)).toBe(artwork.posterFor(film));
    expect(entryBackdrop({ type: 'show', show: series }, client)).toBe(
      artwork.showPosterFor(series),
    );
  });
});

describe('entryRoute', () => {
  it('opens a movie on its item page and a series on its show page', () => {
    expect(entryRoute(movie('itm_1'))).toBe('/item/itm_1');
    expect(entryRoute(show('shw_1'))).toBe('/show/shw_1');
  });
});

describe('planHome', () => {
  it('opens on the hero section and keeps the rest in page order', () => {
    const sections = [
      section('hero', [movie('a')], { layout: 'hero' }),
      section('for-you', [movie('b')]),
      section('trending', [show('c')], { layout: 'ranked' }),
    ];

    const plan = planHome(sections, null);

    expect(plan.hero?.id).toBe('hero');
    expect(plan.rows.map((row) => row.id)).toEqual(['for-you', 'trending']);
  });

  it('keeps only the movies of a hero under the movie filter', () => {
    const hero = section('hero', [movie('a'), show('b'), movie('c')], { layout: 'hero' });

    const plan = planHome([hero], 'movie');

    expect(ids(plan.hero)).toEqual(['a', 'c']);
  });

  it('draws no hero when the filter leaves it nothing', () => {
    const hero = section('hero', [movie('a')], { layout: 'hero' });

    const plan = planHome([hero, section('recent-shows', [show('b')])], 'show');

    expect(plan.hero).toBeNull();
    expect(plan.rows.map((row) => row.id)).toEqual(['recent-shows']);
  });

  it('drops a spotlight whose one title the filter removes', () => {
    const spotlight = section('spotlight', [show('a')], { layout: 'spotlight' });

    const plan = planHome([spotlight, section('recent', [movie('b')])], 'movie');

    expect(plan.rows.map((row) => row.id)).toEqual(['recent']);
  });

  it('has no hero for a home that carries none', () => {
    const plan = planHome([section('recent', [movie('a')])], null);

    expect(plan.hero).toBeNull();
    expect(plan.rows).toHaveLength(1);
  });

  it('leaves a second hero section in its place among the rows', () => {
    const sections = [
      section('hero', [movie('a')], { layout: 'hero' }),
      section('recent', [movie('b')]),
      section('hero-2', [movie('c')], { layout: 'hero' }),
    ];

    const plan = planHome(sections, null);

    expect(plan.hero?.id).toBe('hero');
    expect(plan.rows.map((row) => row.id)).toEqual(['recent', 'hero-2']);
  });

  it('ranks a title by where the server placed it', () => {
    const trending = section('trending', [movie('a'), show('b'), movie('c')], { layout: 'ranked' });

    const [row] = planHome([trending], null).rows;

    expect(row?.entries.map(({ rank }) => rank)).toEqual([1, 2, 3]);
  });

  it('keeps the rank of a title when the filter drops the ones above it', () => {
    const trending = section('trending', [show('a'), movie('b'), show('c'), movie('d')], {
      layout: 'ranked',
    });

    const [row] = planHome([trending], 'movie').rows;

    expect(row?.entries.map(({ entry, rank }) => [entryId(entry), rank])).toEqual([
      ['b', 2],
      ['d', 4],
    ]);
  });

  it('pairs a title with the note the section carries for it', () => {
    const fresh = section('new-episodes', [show('a'), show('b')], {
      layout: 'wide',
      notes: { a: '2 new episodes' },
    });

    const [row] = planHome([fresh], null).rows;

    expect(row?.entries.map(({ note }) => note)).toEqual(['2 new episodes', null]);
  });

  it('carries the reason of a section, and none where the server gave none', () => {
    const sections = [
      section('because:x', [movie('a')], { reason: 'Because you watched Heat' }),
      section('recent', [movie('b')]),
    ];

    const { rows } = planHome(sections, null);

    expect(rows.map((row) => row.reason)).toEqual(['Because you watched Heat', null]);
  });
});

describe('servesHero', () => {
  it('is true for a home whose page the server opens itself', () => {
    expect(servesHero([section('hero', [movie('a')], { layout: 'hero' })])).toBe(true);
  });

  it('is false for the rails an older server sends', () => {
    expect(servesHero([section('recent', [movie('a')])])).toBe(false);
  });
});

describe('featuredFallback', () => {
  it('opens on the featured title when nothing is filtered', () => {
    const pick = movie('a');

    expect(featuredFallback(pick, null)).toBe(pick);
  });

  it('keeps a featured title of the type the filter asks for', () => {
    const pick = show('a');

    expect(featuredFallback(pick, 'show')).toBe(pick);
  });

  it('opens on nothing when the featured title is of the other type', () => {
    expect(featuredFallback(movie('a'), 'show')).toBeNull();
  });

  it('opens on nothing while the server has featured no title', () => {
    expect(featuredFallback(null, null)).toBeNull();
    expect(featuredFallback(undefined, 'movie')).toBeNull();
  });
});

describe('drawsClientMyList', () => {
  it('leaves the saved titles to the section a server sends', () => {
    const sections = [section('recent', [movie('a')]), section('my-list', [show('b')])];

    expect(drawsClientMyList(sections)).toBe(false);
  });

  it('assembles the saved titles itself for a server that sends none', () => {
    expect(drawsClientMyList([section('recent', [movie('a')])])).toBe(true);
  });
});
