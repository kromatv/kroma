import { afterEach, describe, expect, it } from 'vitest';
import { type IconCatalog, iconCategories, iconEntry, setIconCatalog } from './icon-catalog';
import { searchIcons } from './icon-search';

const CATALOG: IconCatalog = {
  trash: { category: 'System', tags: ['delete', 'remove', 'bin'] },
  'align-right': { category: 'Text', tags: ['alignment', 'typography', 'right'] },
  'text-caption': { category: 'Text', tags: ['align', 'paragraph'] },
  'a-b': { category: 'Development', tags: ['test', 'experiment'] },
  'arrow-up': { category: 'Arrows', tags: ['direction', 'north'] },
  'circle-letter-a': { category: 'Letters', tags: ['alphabet'] },
};

const NAMES = [
  'trash',
  'trash-filled',
  'align-right',
  'text-caption',
  'ab',
  'arrow-up',
  'circle-letter-afilled',
  'wave-sine',
] as const;

afterEach(() => setIconCatalog({}));

describe('iconEntry', () => {
  it('answers null while no catalogue is loaded', () => {
    expect(iconEntry('trash')).toBeNull();
    expect(iconCategories()).toEqual([]);
  });

  it('gives a filled variant its base glyph entry', () => {
    setIconCatalog(CATALOG);
    expect(iconEntry('trash-filled')?.tags).toEqual(['delete', 'remove', 'bin']);
  });

  it('finds a glyph whose kit slug drops a separator the catalogue keeps', () => {
    setIconCatalog(CATALOG);
    expect(iconEntry('ab')?.category).toBe('Development');
    expect(iconEntry('circle-letter-afilled')?.category).toBe('Letters');
  });

  it('answers null for a name the catalogue has never heard of', () => {
    setIconCatalog(CATALOG);
    expect(iconEntry('wave-sine')).toBeNull();
  });

  it('lists its categories sorted', () => {
    setIconCatalog(CATALOG);
    expect(iconCategories()).toEqual(['Arrows', 'Development', 'Letters', 'System', 'Text']);
  });
});

describe('searchIcons', () => {
  it('reaches a glyph through a tag its name never mentions', () => {
    setIconCatalog(CATALOG);
    expect(searchIcons(NAMES, 'delete')).toEqual([
      { name: 'trash', tags: ['delete'] },
      { name: 'trash-filled', tags: ['delete'] },
    ]);
  });

  it('ranks a name above a tag that matched as well', () => {
    setIconCatalog(CATALOG);
    const hits = searchIcons(NAMES, 'align');
    expect(hits.map((hit) => hit.name)).toEqual(['align-right', 'text-caption']);
    expect(hits[0]?.tags).toEqual([]);
    expect(hits[1]?.tags).toEqual(['align']);
  });

  it('ranks a tag it matched cleanly above a name it only scatters through', () => {
    setIconCatalog({ trash: { category: 'System', tags: ['delete'] } });
    const scattered = ['device-tablet-exclamation', 'trash'] as const;
    expect(searchIcons(scattered, 'delete')).toEqual([
      { name: 'trash', tags: ['delete'] },
      { name: 'device-tablet-exclamation', tags: [] },
    ]);
  });

  it('finds nothing but names while no catalogue is loaded', () => {
    expect(searchIcons(NAMES, 'delete')).toEqual([]);
    expect(searchIcons(NAMES, 'trash').map((hit) => hit.name)).toEqual(['trash', 'trash-filled']);
  });

  it('narrows to one category, in the given order, for an empty query', () => {
    setIconCatalog(CATALOG);
    expect(searchIcons(NAMES, '', { category: 'System' })).toEqual([
      { name: 'trash', tags: [] },
      { name: 'trash-filled', tags: [] },
    ]);
  });

  it('searches inside the category it was given', () => {
    setIconCatalog(CATALOG);
    expect(searchIcons(NAMES, 'typography', { category: 'Text' }).map((hit) => hit.name)).toEqual([
      'align-right',
    ]);
    expect(searchIcons(NAMES, 'typography', { category: 'Arrows' })).toEqual([]);
  });

  it('returns the whole set for an empty query', () => {
    setIconCatalog(CATALOG);
    expect(searchIcons(NAMES, '').map((hit) => hit.name)).toEqual([...NAMES]);
  });
});
