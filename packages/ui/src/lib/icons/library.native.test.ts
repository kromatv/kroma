import { describe, expect, it } from 'vitest';
import { everyGlyph as NATIVE } from './every-glyph';
import { everyGlyph as WEB } from './every-glyph.web';
import { createIconLibrary } from './library';

describe('the icon library on native', () => {
  it('has nothing to fetch, where the web half fetches the rest of Tabler', () => {
    expect(NATIVE).toBeNull();
    expect(typeof WEB).toBe('function');
  });

  it('is ready at once, so the browser draws instead of waiting', async () => {
    const library = createIconLibrary();
    expect(library.read().ready).toBe(true);

    await expect(library.load()).resolves.toBeUndefined();

    expect(library.read().catalog.iconCategories()).toEqual([]);
  });
});
