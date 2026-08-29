// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { gradeOfNode, installHighlight, shows, walkGraded } from './highlight';
import type { Grade } from './mark';
import { mark } from './mark';

const FR = { scope: null, locale: 'fr' };

function drew(text: string, from: typeof FR | undefined): string {
  return mark({ key: 'auth.login', from, locale: 'fr', text, vars: undefined, holes: [] }, text);
}

function page(html: string): void {
  document.body.innerHTML = `<div data-kroma-devtool="i18n">panel</div><div data-kroma-devtool="react-query">queries</div>${html}`;
}

function graded(outline: 'problems' | 'all'): Record<string, number> {
  const found: Record<string, number> = {};
  walkGraded((grade) => {
    if (!shows(outline, grade)) return;
    found[grade] = (found[grade] ?? 0) + 1;
  });
  return found;
}

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('grading one text node', () => {
  it('reads the mark the inspector left in it', () => {
    expect(gradeOfNode(drew('Connexion', FR))).toBe('catalog');
    expect(gradeOfNode(drew('x', undefined))).toBe('missing');
  });

  it('calls a sentence with no mark one that never went through a catalog', () => {
    expect(gradeOfNode('Blade Runner 2049')).toBe('raw');
  });

  it('grades the punctuation a layout writes between two messages as nothing', () => {
    expect(gradeOfNode(' · ')).toBeNull();
    expect(gradeOfNode('\n  ')).toBeNull();
  });
});

describe('what the overlay marks', () => {
  it('marks each message an element draws, not the box around them', () => {
    page(`<p>${drew('Films', FR)}<span> · </span>${drew('12', FR)}</p>`);

    expect(graded('all')).toEqual({ catalog: 2 });
  });

  it('leaves the strings that are already right alone on problems', () => {
    page(`<p>${drew('Films', FR)}</p><p>${drew('x', undefined)}</p>`);

    expect(graded('problems')).toEqual({ missing: 1 });
  });

  it('leaves out any subtree that says it is a tool, whichever tool it is', () => {
    page('<p>Blade Runner 2049</p>');

    expect(graded('all')).toEqual({ raw: 1 });
  });

  it('has nothing to mark on a page that draws no text', () => {
    page('<p></p>');

    expect(graded('all')).toEqual({});
  });
});

describe('what the overlay walks past', () => {
  it('skips a text node with nothing written in it', () => {
    page('<span id="a"></span>');
    document.querySelector('#a')?.append(document.createTextNode(''));

    expect(graded('all')).toEqual({});
  });
});

describe('the grades a mode shows', () => {
  it('leaves a clean translation out of problems and in all', () => {
    expect(shows('problems', 'catalog' as Grade)).toBe(false);
    expect(shows('all', 'catalog' as Grade)).toBe(true);
    expect(shows('problems', 'missing' as Grade)).toBe(true);
  });
});

class FakeHighlight extends Set<unknown> {}

function registry(): Map<string, FakeHighlight> {
  const held = new Map<string, FakeHighlight>();
  vi.stubGlobal('Highlight', FakeHighlight);
  vi.stubGlobal('StaticRange', class {});
  vi.stubGlobal('CSS', { highlights: held });
  vi.stubGlobal('requestAnimationFrame', (run: () => void) => setTimeout(run, 0) as unknown);
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  return held;
}

describe('putting the overlay up', () => {
  it('registers a highlight per grade and fills the ones the page draws', () => {
    const held = registry();
    page(`<p>${drew('Films', FR)}</p><p>Blade Runner 2049</p>`);

    const stop = installHighlight('all');

    expect([...held.keys()].sort()).toEqual([
      'kroma-i18n-catalog',
      'kroma-i18n-fallback',
      'kroma-i18n-missing',
      'kroma-i18n-raw',
      'kroma-i18n-vars',
    ]);
    expect(held.get('kroma-i18n-catalog')?.size).toBe(1);
    expect(held.get('kroma-i18n-raw')?.size).toBe(1);

    stop();
  });

  it('installs the rules that draw them, and gives the registry back', () => {
    const held = registry();
    page(`<p>${drew('Films', FR)}</p>`);

    const stop = installHighlight('all');

    expect(document.head.querySelector('style')?.textContent).toContain('::highlight(kroma-i18n-');

    stop();

    expect(held.size).toBe(0);
  });

  it('installs the rules once for the page, however often a mode changes', () => {
    registry();
    page(`<p>${drew('Films', FR)}</p>`);

    installHighlight('all')();
    installHighlight('problems')();

    expect(document.head.querySelectorAll('style')).toHaveLength(1);
  });

  it('paints again when the page draws something new', async () => {
    const held = registry();
    page(`<p id="host">${drew('Films', FR)}</p>`);
    const stop = installHighlight('all');

    document.querySelector('#host')?.append(document.createTextNode(drew('Series', FR)));
    await vi.waitFor(() => expect(held.get('kroma-i18n-catalog')?.size).toBe(2));

    stop();
  });

  it('does nothing where the browser has no highlight registry', () => {
    vi.stubGlobal('CSS', {});
    page('<p>Blade Runner 2049</p>');

    expect(() => installHighlight('all')()).not.toThrow();
  });

  it('waits for the first mark before calling anything uncatalogued', () => {
    const held = registry();
    page('<p>Blade Runner 2049</p>');

    const stop = installHighlight('all');

    expect(held.get('kroma-i18n-raw')?.size).toBe(0);
    stop();
  });

  it('still marks the problems where the mode hides what is right', () => {
    const held = registry();
    page(`<p>${drew('Films', FR)}</p><p>Blade Runner 2049</p>`);

    const stop = installHighlight('problems');

    expect([held.get('kroma-i18n-catalog')?.size, held.get('kroma-i18n-raw')?.size]).toEqual([
      0, 1,
    ]);
    stop();
  });

  it('trusts the reading once one string is marked', () => {
    const held = registry();
    page(`<p>${drew('Films', FR)}</p><p>Blade Runner 2049</p>`);

    const stop = installHighlight('all');

    expect([held.get('kroma-i18n-catalog')?.size, held.get('kroma-i18n-raw')?.size]).toEqual([
      1, 1,
    ]);
    stop();
  });

  it('repaints for a change the page made', async () => {
    const held = registry();
    vi.useFakeTimers();
    page('<p id="a">Blade Runner 2049</p>');
    const stop = installHighlight('all');

    document.querySelector('#a')?.replaceChildren(drew('Films', FR));
    await Promise.resolve();
    vi.runAllTimers();
    const drawn = held.get('kroma-i18n-catalog')?.size;
    stop();
    vi.useRealTimers();

    expect(drawn).toBe(1);
  });

  it('leaves the page alone for a change the tools made to their own panel', async () => {
    const held = registry();
    vi.useFakeTimers();
    page(`<p>${drew('Films', FR)}</p>`);
    const stop = installHighlight('all');
    held.get('kroma-i18n-catalog')?.clear();

    const panel = document.querySelector('[data-kroma-devtool="i18n"]');
    if (panel?.firstChild) panel.firstChild.nodeValue = 'redrawn';
    await Promise.resolve();
    vi.runAllTimers();
    const drawn = held.get('kroma-i18n-catalog')?.size;
    stop();
    vi.useRealTimers();

    expect(drawn).toBe(0);
  });
});
