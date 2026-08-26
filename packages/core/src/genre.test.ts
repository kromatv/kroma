import { describe, expect, it } from 'vitest';
import {
  findGenre,
  GENRES,
  genreGlyph,
  genreLabel,
  genreLabels,
  genreOfSegment,
  genreOfTmdbId,
  genreSegment,
  genreSlug,
  genreSlugs,
} from './genre';
import { createTranslator } from './i18n';
import en from './locales/en.json';
import fr from './locales/fr.json';

describe('findGenre', () => {
  it('folds both localizations of a genre onto one identity', () => {
    expect(findGenre('Family')).toBe('family');
    expect(findGenre('Familial')).toBe('family');
  });

  it('matches through case, spacing, punctuation and missing accents', () => {
    expect(findGenre('  SCIENCE fiction ')).toBe('science-fiction');
    expect(findGenre('Science-Fiction')).toBe('science-fiction');
    expect(findGenre('telefilm')).toBe('tv-movie');
  });

  it('keeps a compound TV genre apart from the movie genre it starts with', () => {
    expect(findGenre('War')).toBe('war');
    expect(findGenre('War & Politics')).toBe('war-politics');
    expect(findGenre('Science-Fiction & Fantastique')).toBe('sci-fi-fantasy');
  });

  it('resolves a slug as readily as a display name', () => {
    expect(findGenre('sci-fi-fantasy')).toBe('sci-fi-fantasy');
    expect(findGenre('tv-movie')).toBe('tv-movie');
  });

  it('leaves a genre it has no copy for unknown rather than guessing', () => {
    expect(findGenre('K-Drama')).toBeUndefined();
    expect(findGenre('')).toBeUndefined();
  });

  it('never lets one spelling name two genres', () => {
    const claimed = new Map<string, string>();
    const clashes = GENRES.flatMap(({ slug }) =>
      [slug, genreLabel(createTranslator('fr'), slug), genreLabel(createTranslator('en'), slug)]
        .map((name) => ({ name, taken: claimed.get(genreSlug(name)) }))
        .filter(({ name, taken }) => {
          claimed.set(genreSlug(name), slug);
          return taken !== undefined && taken !== slug;
        }),
    );

    expect(clashes).toEqual([]);
  });
});

const GENRE_PREFIX = 'genre.';

function copySlugs(catalogue: Readonly<Record<string, string>>): string[] {
  return Object.keys(catalogue)
    .filter((key) => key.startsWith(GENRE_PREFIX))
    .map((key) => key.slice(GENRE_PREFIX.length));
}

describe('the genre table', () => {
  // The other direction needs no test: `labelKey` returns `genre.${GenreSlug}`
  // and hands it to a `MessageKey` parameter, so a row with no copy cannot
  // compile.
  it('has a row for every genre the copy catalogue names', () => {
    const tabled = new Set<string>(GENRES.map((genre) => genre.slug));
    const orphans = [...copySlugs(fr), ...copySlugs(en)].filter((slug) => !tabled.has(slug));

    expect(orphans).toEqual([]);
  });

  it('names each genre once', () => {
    const slugs = GENRES.map((genre) => genre.slug);

    expect(slugs).toEqual([...new Set(slugs)]);
  });

  it('claims each provider id once', () => {
    const ids = GENRES.map((genre) => genre.tmdb);

    expect(ids).toEqual([...new Set(ids)]);
  });

  it('reads in slug order, so a new genre lands where it belongs', () => {
    const slugs = GENRES.map((genre) => genre.slug);

    expect(slugs).toEqual([...slugs].sort());
  });
});

describe('genreOfTmdbId', () => {
  it('reads the genre off the id the provider sent, whatever language it spoke', () => {
    expect(genreOfTmdbId(10765)).toBe('sci-fi-fantasy');
    expect(genreOfTmdbId(10751)).toBe('family');
  });

  it('knows every genre TMDB publishes, movie and TV lists merged', () => {
    const ids = GENRES.map((genre) => genre.tmdb).sort((a, b) => a - b);

    expect(ids).toEqual([
      12, 14, 16, 18, 27, 28, 35, 36, 37, 53, 80, 99, 878, 9648, 10402, 10749, 10751, 10752, 10759,
      10762, 10763, 10764, 10765, 10766, 10767, 10768, 10770,
    ]);
  });

  it('has no genre for an id no list publishes', () => {
    expect(genreOfTmdbId(4242)).toBeUndefined();
  });
});

describe('genreSlug', () => {
  it('slugs every localization of a genre the same way', () => {
    expect(genreSlug('Science-Fiction & Fantastique')).toBe('sci-fi-fantasy');
    expect(genreSlug('Sci-Fi & Fantasy')).toBe('sci-fi-fantasy');
  });

  it('is idempotent, so a slug read back off a URL survives the round trip', () => {
    expect(genreSlug(genreSlug('Familial'))).toBe('family');
    expect(genreSlug(genreSlug('K-Drama'))).toBe('k-drama');
  });

  it('still links a genre it has no copy for', () => {
    expect(genreSlug(' Film Noir ')).toBe('film-noir');
  });
});

describe('genreLabel', () => {
  it('reads a genre in the reader language whichever spelling was stored', () => {
    const fr = createTranslator('fr');
    const en = createTranslator('en');

    expect(genreLabel(fr, 'Family')).toBe('Familial');
    expect(genreLabel(fr, 'family')).toBe('Familial');
    expect(genreLabel(en, 'Familial')).toBe('Family');
  });

  it('names every genre in both catalogues', () => {
    const fr = createTranslator('fr');
    const en = createTranslator('en');

    const bare = GENRES.filter(
      ({ slug }) =>
        genreLabel(fr, slug).startsWith('genre.') || genreLabel(en, slug).startsWith('genre.'),
    ).map(({ slug }) => slug);

    expect(bare).toEqual([]);
  });

  it('falls back to the stored spelling for a genre it does not know', () => {
    expect(genreLabel(createTranslator('fr'), ' K-Drama ')).toBe('K-Drama');
  });
});

describe('genreGlyph', () => {
  it('gives both localizations of a genre the same glyph', () => {
    expect(genreGlyph('Horror')).toBe('ghost');
    expect(genreGlyph('Horreur')).toBe('ghost');
  });

  it('has no glyph for a genre it does not know', () => {
    expect(genreGlyph('K-Drama')).toBeUndefined();
  });
});

describe('genreSlugs', () => {
  it('reads a title through the provider ids it was stored with', () => {
    const title = { tmdbGenreIds: [10765, 18], genres: ['Science-Fiction & Fantastique', 'Drame'] };

    expect(genreSlugs(title)).toEqual(['sci-fi-fantasy', 'drama']);
  });

  it('reads a title enriched before the ids were kept off its names alone', () => {
    const title = { genres: ['Science-Fiction & Fantastique', 'Drame'] };

    expect(genreSlugs(title)).toEqual(['sci-fi-fantasy', 'drama']);
  });

  it('reads an id the same whichever language named it beside the id', () => {
    const fr = { tmdbGenreIds: [10751], genres: ['Familial'] };
    const en = { tmdbGenreIds: [10751], genres: ['Family'] };

    expect(genreSlugs(fr)).toEqual(genreSlugs(en));
  });

  it('falls back to the name beside an id no published list names', () => {
    const title = { tmdbGenreIds: [4242], genres: ['K-Drama'] };

    expect(genreSlugs(title)).toEqual(['k-drama']);
  });

  it('lines up with genreLabels, so a slug and its label share an index', () => {
    const title = { tmdbGenreIds: [10751, 4242, 27], genres: ['Family', 'K-Drama', 'Horror'] };

    expect(genreSlugs(title)).toEqual(['family', 'k-drama', 'horror']);
    expect(genreLabels(createTranslator('fr'), title)).toEqual(['Familial', 'K-Drama', 'Horreur']);
  });

  it('drops a genre that is neither a known id nor a nameable spelling', () => {
    const title = { genres: ['!!!', 'Horror'] };

    expect(genreSlugs(title)).toEqual(['horror']);
    expect(genreLabels(createTranslator('fr'), title)).toEqual(['Horreur']);
  });

  it('has no genres for a title carrying none', () => {
    expect(genreSlugs({ genres: [] })).toEqual([]);
    expect(genreSlugs(undefined)).toEqual([]);
    expect(genreSlugs(null)).toEqual([]);
  });
});

describe('genreLabels', () => {
  it('names a title read through its ids in the reader language, not the stored one', () => {
    const stored = { tmdbGenreIds: [10751, 27], genres: ['Family', 'Horror'] };

    expect(genreLabels(createTranslator('fr'), stored)).toEqual(['Familial', 'Horreur']);
  });

  it('names a title enriched before the ids were kept off its stored spellings', () => {
    expect(genreLabels(createTranslator('fr'), { genres: ['Family'] })).toEqual(['Familial']);
  });

  it('falls back to the spelling beside an id it does not know', () => {
    const title = { tmdbGenreIds: [4242], genres: [' K-Drama '] };

    expect(genreLabels(createTranslator('fr'), title)).toEqual(['K-Drama']);
  });

  it('names nothing for a title carrying no genres', () => {
    expect(genreLabels(createTranslator('fr'), undefined)).toEqual([]);
  });
});

describe('genreSegment', () => {
  it('addresses a known genre by the provider id, so the link carries no language', () => {
    expect(genreSegment('Science Fiction')).toBe('878');
    expect(genreSegment('Science-Fiction')).toBe('878');
    expect(genreSegment('science-fiction')).toBe('878');
  });

  it('keeps addressing a genre the app has no id for by its folded name', () => {
    expect(genreSegment(' Film Noir ')).toBe('film-noir');
  });

  it('round-trips through genreOfSegment for every genre in the table', () => {
    const broken = GENRES.filter(({ slug }) => genreOfSegment(genreSegment(slug)) !== slug);

    expect(broken).toEqual([]);
  });
});

describe('genreOfSegment', () => {
  it('reads a provider id straight off the URL', () => {
    expect(genreOfSegment('878')).toBe('science-fiction');
    expect(genreOfSegment('10765')).toBe('sci-fi-fantasy');
  });

  it('still reads a slug or a display name a bookmark predates the ids with', () => {
    expect(genreOfSegment('science-fiction')).toBe('science-fiction');
    expect(genreOfSegment('Familial')).toBe('family');
  });

  it('folds a genre it has no id for rather than losing it', () => {
    expect(genreOfSegment('film-noir')).toBe('film-noir');
  });

  it('has no genre for an id no published list names', () => {
    expect(genreOfSegment('4242')).toBe('4242');
    expect(genreOfSegment('')).toBe('');
  });
});
