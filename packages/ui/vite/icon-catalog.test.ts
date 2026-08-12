import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IconCatalog } from '../src/lib/icon-catalog.ts';
import { kromaIconCatalog } from './icon-catalog.ts';

// Tabler's own file, unless a test stands one of its own in its place.
const written = vi.hoisted(() => ({ json: null as string | null }));

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  return {
    ...real,
    readFileSync: (...args: Parameters<typeof real.readFileSync>) =>
      written.json ?? real.readFileSync(...args),
  };
});

afterEach(() => {
  written.json = null;
});

// Imported as a module rather than read as text: what a workbench gets is the
// module this code EVALUATES to, dictionary expansion and all.
async function catalog(): Promise<IconCatalog> {
  const plugin = kromaIconCatalog();
  const id = plugin.resolveId('virtual:kroma-icon-catalog');
  if (!id) throw new Error('the plugin did not claim its own module id');
  const source = plugin.load(id);
  if (!source) throw new Error('the plugin served no catalogue');
  const module = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  return module.ICON_CATALOG as IconCatalog;
}

describe('kromaIconCatalog', () => {
  it('claims only its own module id', () => {
    const plugin = kromaIconCatalog();
    expect(plugin.resolveId('virtual:kroma-icon-catalog')).toBe('\0virtual:kroma-icon-catalog');
    expect(plugin.resolveId('react')).toBeNull();
    expect(plugin.load('react')).toBeNull();
  });

  it('reads every glyph Tabler documents', async () => {
    expect(Object.keys(await catalog()).length).toBeGreaterThan(5000);
  });

  it('gives a glyph the category and the tags its name never says', async () => {
    const trash = (await catalog()).trash;
    expect(trash?.category).toBe('System');
    expect(trash?.tags).toContain('delete');
  });

  it('keeps a numeric tag as a searchable token and drops the unusable ones', async () => {
    const tags = (await catalog())['a-b-2']?.tags ?? [];
    expect(tags).toContain('2');
    expect(tags).not.toContain('');
  });

  it('costs one malformed glyph its own metadata and nothing else', async () => {
    // A search nicety: a build that died over one unreadable entry would be a
    // worse trade than a glyph with no tags.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    written.json = JSON.stringify({
      trash: { category: 'System', tags: ['delete'] },
      broken: { tags: ['nothing says which category'] },
    });
    const found = await catalog();
    expect(Object.keys(found)).toEqual(['trash']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('1 glyphs'));
    warn.mockRestore();
  });

  it('ships the tag words once, not once per glyph', async () => {
    const plugin = kromaIconCatalog();
    const id = plugin.resolveId('virtual:kroma-icon-catalog') ?? '';
    const source = plugin.load(id) ?? '';
    const entries = Object.keys(await catalog()).length;
    expect(source.split('"delete"').length - 1).toBe(1);
    expect(source.length).toBeLessThan(entries * 100);
  });
});
