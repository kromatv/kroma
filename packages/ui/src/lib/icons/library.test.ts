import { afterEach, describe, expect, it, vi } from 'vitest';
import { iconCategories, setIconCatalog } from '#ui/lib/icon-catalog';
import { hasGlyph, iconNames } from './glyphs';
import { iconLibraryReady, loadIconLibrary, setIconCatalogLoader } from './library';

// One glyph stands in for the chunk the web half fetches: the runner resolves
// `./every-glyph` to that half, and it would hand back all six thousand.
const chunk = vi.hoisted(() => ({
  glyphs: { IconNotShipped: () => null } as Record<string, unknown>,
}));
vi.mock('./every-glyph', () => ({ everyGlyph: async () => chunk.glyphs }));

afterEach(() => {
  setIconCatalog({});
});

describe('the icon library', () => {
  it('draws only what the build kept until someone asks for the rest', () => {
    expect(iconLibraryReady()).toBe(false);
    expect(hasGlyph('not-shipped')).toBe(false);
    expect(iconCategories()).toEqual([]);
  });

  it('widens the drawable set and fills the catalogue in one step', async () => {
    setIconCatalogLoader(async () => ({ trash: { category: 'System', tags: ['delete'] } }));

    await loadIconLibrary();

    expect(iconLibraryReady()).toBe(true);
    expect(hasGlyph('not-shipped')).toBe(true);
    expect(iconNames()).toContain('not-shipped');
    expect(iconCategories()).toEqual(['System']);
  });

  it('fetches once, however many pages ask', async () => {
    const fetchCatalog = vi.fn(async () => ({}));
    setIconCatalogLoader(fetchCatalog);

    await Promise.all([loadIconLibrary(), loadIconLibrary()]);
    await loadIconLibrary();

    expect(fetchCatalog).toHaveBeenCalledTimes(1);
  });

  it('leaves the glyphs the build kept when the fetch fails', async () => {
    setIconCatalogLoader(() => Promise.reject(new Error('no such chunk')));

    await expect(loadIconLibrary()).resolves.toBeUndefined();

    expect(iconLibraryReady()).toBe(true);
    expect(iconCategories()).toEqual([]);
  });

  it('keeps the half that landed when the other chunk does not', async () => {
    chunk.glyphs = { IconArrivedAlone: () => null };
    setIconCatalogLoader(() => Promise.reject(new Error('no such chunk')));

    await loadIconLibrary();

    expect(hasGlyph('arrived-alone')).toBe(true);
    expect(iconCategories()).toEqual([]);
  });
});
