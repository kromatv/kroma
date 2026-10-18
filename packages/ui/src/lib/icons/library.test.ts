import { describe, expect, it, vi } from 'vitest';
import { createIconLibrary } from './library';

const chunk = vi.hoisted<{ glyphs: Record<string, () => null> }>(() => ({
  glyphs: { IconNotShipped: () => null },
}));
const loadGlyphs = async () => chunk.glyphs;
describe('the root-owned icon library', () => {
  it('keeps the build subset until the root requests its library', () => {
    const library = createIconLibrary({ loadGlyphs });
    expect(library.read().ready).toBe(false);
    expect(library.read().glyphs.hasGlyph('not-shipped')).toBe(false);
    expect(library.read().catalog.iconCategories()).toEqual([]);
  });
  it('loads glyphs and metadata without changing a different root', async () => {
    const a = createIconLibrary({
      loadGlyphs,
      loadCatalog: async () => ({ trash: { category: 'System', tags: ['delete'] } }),
    });
    const b = createIconLibrary({ loadGlyphs });
    await a.load();
    expect(a.read().ready).toBe(true);
    expect(a.read().glyphs.hasGlyph('not-shipped')).toBe(true);
    expect(a.read().glyphs.iconNames()).toContain('not-shipped');
    expect(a.read().catalog.iconCategories()).toEqual(['System']);
    expect(b.read().ready).toBe(false);
    expect(b.read().glyphs.hasGlyph('not-shipped')).toBe(false);
    expect(b.read().catalog.iconCategories()).toEqual([]);
  });
  it('fetches once per owner, however many consumers ask', async () => {
    const loadCatalog = vi.fn(async () => ({}));
    const library = createIconLibrary({ loadGlyphs, loadCatalog });
    await Promise.all([library.load(), library.load()]);
    await library.load();
    expect(loadCatalog).toHaveBeenCalledOnce();
  });
  it('keeps the original subset when either chunk fails', async () => {
    const library = createIconLibrary({
      loadGlyphs: async () => {
        throw new Error('missing glyphs');
      },
      loadCatalog: async () => {
        throw new Error('missing metadata');
      },
    });
    await expect(library.load()).resolves.toBeUndefined();
    expect(library.read().ready).toBe(true);
    expect(library.read().catalog.iconCategories()).toEqual([]);
  });
  it('uses the half that arrived when metadata failed', async () => {
    const library = createIconLibrary({
      loadGlyphs: async () => ({ IconArrivedAlone: () => null }),
      loadCatalog: async () => {
        throw new Error('missing metadata');
      },
    });
    await library.load();
    expect(library.read().glyphs.hasGlyph('arrived-alone')).toBe(true);
    expect(library.read().catalog.iconCategories()).toEqual([]);
  });
});

it('settles loader failures that throw before returning a promise', async () => {
  const library = createIconLibrary({
    loadGlyphs: () => {
      throw new Error('sync failure');
    },
    loadCatalog: () => {
      throw new Error('sync failure');
    },
  });
  await expect(library.load()).resolves.toBeUndefined();
  expect(library.read().ready).toBe(true);
});
