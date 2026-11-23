import { describe, expect, it } from 'vitest';
import { filterTitles } from './browse-filter';

function title(name: string, genre: string, languages: { audio: string[]; subtitles: string[] }) {
  return {
    title: name,
    year: null,
    addedAt: 't',
    metadata: { genres: [genre], rating: null, releaseDate: null },
    audioLanguages: languages.audio,
    subtitleLanguages: languages.subtitles,
  };
}

const items = [
  title('Dubbed drama', 'Drama', { audio: ['eng', 'fre'], subtitles: ['ger'] }),
  title('Anime drama', 'Drama', { audio: ['jpn'], subtitles: ['fre', 'eng'] }),
  title('Comedy', 'Comedy', { audio: ['fre'], subtitles: [] }),
];

const names = (list: readonly { title: string }[]) => list.map((item) => item.title);

describe('filterTitles', () => {
  it('keeps every title when nothing is picked', () => {
    expect(names(filterTitles(items, {}))).toEqual(['Dubbed drama', 'Anime drama', 'Comedy']);
  });

  it('keeps a title heard in the language in any of its tracks', () => {
    expect(names(filterTitles(items, { audio: 'fr' }))).toEqual(['Dubbed drama', 'Comedy']);
  });

  it('keeps a title readable in the language', () => {
    expect(names(filterTitles(items, { subtitles: 'fr' }))).toEqual(['Anime drama']);
  });

  it('keeps only what every picked filter keeps', () => {
    expect(names(filterTitles(items, { genre: 'drama', audio: 'ja', subtitles: 'en' }))).toEqual([
      'Anime drama',
    ]);
    expect(names(filterTitles(items, { genre: 'comedy', subtitles: 'de' }))).toEqual([]);
  });
});
