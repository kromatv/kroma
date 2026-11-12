import { describe, expect, it } from 'vitest';
import { filterDefinitions, languagesIn } from './definition-filter';
import type { IndexerDefinitionView } from './schemas';

const def = (
  id: string,
  kind: string,
  language: string,
  description = '',
): IndexerDefinitionView => ({
  id,
  name: id.toUpperCase(),
  kind,
  description,
  links: [],
  language,
});

const CATALOG = [
  def('yggtorrent', 'private', 'fr-FR'),
  def('torrent9', 'public', 'fr-FR', 'French public tracker'),
  def('cpasbien', 'public', 'fr-CA'),
  def('rutracker', 'semi-private', 'ru-RU'),
  def('1337x', 'public', 'en-US'),
  def('mystery', 'public', ''),
];

const ALL = { query: '', kind: 'all', language: 'all' } as const;

describe('filterDefinitions', () => {
  it('keeps every tracker when nothing is filtered', () => {
    expect(filterDefinitions(CATALOG, ALL)).toHaveLength(6);
  });

  it('counts a semi-private tracker as private', () => {
    const ids = filterDefinitions(CATALOG, { ...ALL, kind: 'private' }).map((d) => d.id);

    expect(ids).toEqual(['yggtorrent', 'rutracker']);
  });

  it('matches a language on its base, whatever the region', () => {
    const ids = filterDefinitions(CATALOG, { ...ALL, language: 'fr' }).map((d) => d.id);

    expect(ids).toEqual(['yggtorrent', 'torrent9', 'cpasbien']);
  });

  it('searches the name and the description without regard to case', () => {
    const byName = filterDefinitions(CATALOG, { ...ALL, query: 'YGG' }).map((d) => d.id);
    const byDescription = filterDefinitions(CATALOG, { ...ALL, query: 'french' }).map((d) => d.id);

    expect(byName).toEqual(['yggtorrent']);
    expect(byDescription).toEqual(['torrent9']);
  });

  it('combines every filter', () => {
    const ids = filterDefinitions(CATALOG, {
      query: 'torrent',
      kind: 'public',
      language: 'fr',
    }).map((d) => d.id);

    expect(ids).toEqual(['torrent9']);
  });
});

describe('languagesIn', () => {
  it('lists each base language once, by how many trackers speak it', () => {
    expect(languagesIn(CATALOG)).toEqual(['fr', 'en', 'ru']);
  });
});
