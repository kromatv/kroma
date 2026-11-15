import type { CardSection, MediaCard, Show } from '@kromatv/client/media';
import { fakeClient } from '@kromatv/client/test';
import { describe, expect, it } from 'vitest';
import { heroSlides } from '#tv/features/catalog/home/hero-slides';
import type { HomeEntry } from '#tv/features/catalog/home/sectionEntry';

const client = fakeClient({
  media: {
    artwork: {
      backdropFor: (x) => x.metadata?.backdropUrl ?? null,
      posterFor: (m) => `poster:${m.id}`,
      showPosterFor: (s) => `poster:${s.id}`,
    },
  },
});

const dune = {
  id: 'm1',
  title: 'Dune',
  video: { codec: 'hevc', width: 3840, hdr: true },
  metadata: { backdropUrl: 'backdrop:m1' },
} as unknown as MediaCard;
const silo = { id: 's1', title: 'Silo', video: null, metadata: null } as unknown as Show;

const DUNE: HomeEntry = { type: 'movie', item: dune };
const SILO: HomeEntry = { type: 'show', show: silo };

const section = (over: Partial<CardSection>): CardSection => ({
  id: 'row',
  title: 'Row',
  layout: 'rail',
  notes: {},
  items: [],
  ...over,
});

const NOTHING = { sections: [], featured: null, movies: [] };

describe('heroSlides', () => {
  it('opens on the entries of the hero section, each with why it is there', () => {
    const hero = section({ layout: 'hero', items: [DUNE, SILO], notes: { m1: 'Trending' } });

    const slides = heroSlides({ ...NOTHING, sections: [section({ items: [SILO] }), hero] }, client);

    expect(slides).toEqual([
      { entry: DUNE, backdrop: 'backdrop:m1', badge: 'HDR', note: 'Trending' },
      { entry: SILO, backdrop: 'poster:s1', badge: null, note: null },
    ]);
  });

  it('opens on the featured pick of a server that sends no hero', () => {
    const slides = heroSlides(
      { ...NOTHING, sections: [section({ items: [DUNE] })], featured: SILO },
      client,
    );

    expect(slides.map((slide) => slide.entry)).toEqual([SILO]);
  });

  it('stands the first entry of the top section in until a pick lands', () => {
    const slides = heroSlides({ ...NOTHING, sections: [section({ items: [DUNE, SILO] })] }, client);

    expect(slides.map((slide) => slide.entry)).toEqual([DUNE]);
  });

  it('stands the first catalogue movie in while the home is still on its way', () => {
    const slides = heroSlides({ ...NOTHING, movies: [dune] }, client);

    expect(slides.map((slide) => slide.entry)).toEqual([DUNE]);
  });

  it('has nothing to open on in an empty library', () => {
    expect(heroSlides(NOTHING, client)).toEqual([]);
  });
});
