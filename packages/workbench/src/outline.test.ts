import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { ACTIVE_BAND, activeSection, type Section, textOf } from './outline';

const DOC: readonly Section[] = [
  { id: 'a-vite-app', label: 'A Vite app', level: 2, y: 300 },
  { id: 'the-stylesheet', label: 'The stylesheet', level: 3, y: 900 },
  { id: 'a-metro-app', label: 'A Metro app', level: 2, y: 1500 },
];

const TOP = 40;

// Where the scroller has to be for the heading at `y` to have just passed the
// band above the window.
const reaching = (y: number) => TOP + y - ACTIVE_BAND;

describe('activeSection', () => {
  it('names nothing while the article is still on its opening lines', () => {
    expect(activeSection(DOC, TOP, 0)).toBeUndefined();
  });

  it('follows the last heading to have passed the top of the window', () => {
    expect(activeSection(DOC, TOP, reaching(300))).toBe('a-vite-app');
    expect(activeSection(DOC, TOP, reaching(900))).toBe('the-stylesheet');
    expect(activeSection(DOC, TOP, reaching(1500) - 1)).toBe('the-stylesheet');
  });

  it('hands the end of the document to its closing section', () => {
    expect(activeSection(DOC, TOP, reaching(900), true)).toBe('a-metro-app');
    expect(activeSection([], TOP, 0, true)).toBeUndefined();
  });
});

describe('textOf', () => {
  it('flattens the marks a heading is written with', () => {
    const heading = createElement('h2', null, [
      'Installing ',
      createElement('code', { key: 'code' }, '@kroma/ui'),
    ]);
    expect(textOf(heading)).toBe('Installing @kroma/ui');
  });

  it('reads a number as its digits and anything else as nothing', () => {
    expect(textOf(3)).toBe('3');
    expect(textOf(null)).toBe('');
  });
});
