import { describe, expect, it } from 'vitest';
import { createIconCatalog, type IconCatalog } from './icon-catalog';
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

describe('iconEntry', () => {
  it('answers null while no catalogue is loaded', () => {
    const catalog = createIconCatalog({});
    expect(catalog.iconEntry('trash')).toBeNull();
    expect(catalog.iconCategories()).toEqual([]);
  });

  it('gives a filled variant its base glyph entry', () => {
    const catalog = createIconCatalog(CATALOG);
    expect(catalog.iconEntry('trash-filled')?.tags).toEqual(['delete', 'remove', 'bin']);
  });

  it('finds a glyph whose kit slug drops a separator the catalogue keeps', () => {
    const catalog = createIconCatalog(CATALOG);
    expect(catalog.iconEntry('ab')?.category).toBe('Development');
    expect(catalog.iconEntry('circle-letter-afilled')?.category).toBe('Letters');
  });

  it('answers null for a name the catalogue has never heard of', () => {
    const catalog = createIconCatalog(CATALOG);
    expect(catalog.iconEntry('wave-sine')).toBeNull();
  });

  it('lists its categories sorted', () => {
    const catalog = createIconCatalog(CATALOG);
    expect(catalog.iconCategories()).toEqual([
      'Arrows',
      'Development',
      'Letters',
      'System',
      'Text',
    ]);
  });
});

function searching(catalog: IconCatalog): typeof searchIcons {
  const index = createIconCatalog(catalog);
  return (names, query, options) => searchIcons(names, query, { ...options, catalog: index });
}

describe('searchIcons', () => {
  it('reaches a glyph through a tag its name never mentions', () => {
    const search = searching(CATALOG);
    expect(search(NAMES, 'delete')).toEqual([
      { name: 'trash', tags: ['delete'] },
      { name: 'trash-filled', tags: ['delete'] },
    ]);
  });

  it('ranks a name above a tag that matched as well', () => {
    const search = searching(CATALOG);
    const hits = search(NAMES, 'align');
    expect(hits.map((hit) => hit.name)).toEqual(['align-right', 'text-caption']);
    expect(hits[0]?.tags).toEqual([]);
    expect(hits[1]?.tags).toEqual(['align']);
  });

  it('ranks a tag it matched cleanly above a name it only scatters through', () => {
    const search = searching({ trash: { category: 'System', tags: ['delete'] } });
    const scattered = ['device-tablet-exclamation', 'trash'] as const;
    expect(search(scattered, 'delete')).toEqual([
      { name: 'trash', tags: ['delete'] },
      { name: 'device-tablet-exclamation', tags: [] },
    ]);
  });

  it('finds nothing but names while no catalogue is loaded', () => {
    expect(searchIcons(NAMES, 'delete')).toEqual([]);
    expect(searchIcons(NAMES, 'trash').map((hit) => hit.name)).toEqual(['trash', 'trash-filled']);
  });

  it('narrows to one category, in the given order, for an empty query', () => {
    const search = searching(CATALOG);
    expect(search(NAMES, '', { category: 'System' })).toEqual([
      { name: 'trash', tags: [] },
      { name: 'trash-filled', tags: [] },
    ]);
  });

  it('searches inside the category it was given', () => {
    const search = searching(CATALOG);
    expect(search(NAMES, 'typography', { category: 'Text' }).map((hit) => hit.name)).toEqual([
      'align-right',
    ]);
    expect(search(NAMES, 'typography', { category: 'Arrows' })).toEqual([]);
  });

  it('returns the whole set for an empty query', () => {
    const search = searching(CATALOG);
    expect(search(NAMES, '').map((hit) => hit.name)).toEqual([...NAMES]);
  });
});
