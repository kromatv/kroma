import { describe, expect, it } from 'vitest';
import { iconCategories } from '#ui/lib/icon-catalog';
import { everyGlyph as NATIVE } from './every-glyph';
import { everyGlyph as WEB } from './every-glyph.web';
import { iconLibraryReady, loadIconLibrary } from './library';

describe('the icon library on native', () => {
  it('has nothing to fetch, where the web half fetches the rest of Tabler', () => {
    expect(NATIVE).toBeNull();
    expect(typeof WEB).toBe('function');
  });

  it('is ready at once, so the browser draws instead of waiting', async () => {
    expect(iconLibraryReady()).toBe(true);

    await expect(loadIconLibrary()).resolves.toBeUndefined();

    expect(iconCategories()).toEqual([]);
  });
});
