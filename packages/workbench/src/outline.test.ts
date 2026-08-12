// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { describe, expect, it } from 'vitest';
import {
  ACTIVE_BAND,
  activeSection,
  OutlineContext,
  type Section,
  textOf,
  useDocumentTop,
  useOutline,
  useSection,
} from './outline';

// What a view reports as it lays out; only `y` is read.
const laidOutAt = (y: number) =>
  ({ nativeEvent: { layout: { x: 0, y, width: 0, height: 0 } } }) as LayoutChangeEvent;

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

describe('useOutline', () => {
  const at = (id: string, y: number, level = 2): Section => ({ id, label: id, level, y });

  it('puts the headings in the order the document laid them out, not the order they arrived', () => {
    const { result } = renderHook(() => useOutline('installing'));
    act(() => {
      result.current.sink.reportSection(at('the-stylesheet', 900));
      result.current.sink.reportSection(at('a-vite-app', 300));
    });
    expect(result.current.sections.map((one) => one.id)).toEqual(['a-vite-app', 'the-stylesheet']);
  });

  it('gives two headings of the same words two addresses', () => {
    const { result } = renderHook(() => useOutline('installing'));
    let first = '';
    let second = '';
    act(() => {
      first = result.current.sink.claim('react-key-1', 'the-stylesheet');
      second = result.current.sink.claim('react-key-2', 'the-stylesheet');
    });
    expect([first, second]).toEqual(['the-stylesheet', 'the-stylesheet-2']);
  });

  it('returns the SAME id for one heading however often it re-renders', () => {
    const { result, rerender } = renderHook(() => useOutline('installing'));
    const first = result.current.sink.claim('react-key-1', 'a-vite-app');
    rerender();
    expect(result.current.sink.claim('react-key-1', 'a-vite-app')).toBe(first);
  });

  it('re-measures a heading in place rather than listing it twice', () => {
    const { result } = renderHook(() => useOutline('installing'));
    act(() => result.current.sink.reportSection(at('a-vite-app', 300)));
    act(() => result.current.sink.reportSection(at('a-vite-app', 420)));
    expect(result.current.sections).toEqual([at('a-vite-app', 420)]);
  });

  it('holds still when a heading reports the position it already had', () => {
    const { result } = renderHook(() => useOutline('installing'));
    act(() => result.current.sink.reportSection(at('a-vite-app', 300)));
    const settled = result.current.sections;
    act(() => result.current.sink.reportSection(at('a-vite-app', 300)));
    expect(result.current.sections).toBe(settled);
  });

  it('carries where the document starts, which every heading is measured from', () => {
    const { result } = renderHook(() => useOutline('installing'));
    act(() => result.current.sink.reportTop(48));
    expect(result.current.top).toBe(48);
  });

  it('holds still when the document reports the start it already had', () => {
    const { result } = renderHook(() => useOutline('installing'));
    act(() => result.current.sink.reportTop(48));
    const settled = result.current;
    act(() => result.current.sink.reportTop(48));
    expect(result.current.sections).toBe(settled.sections);
    expect(result.current.top).toBe(48);
  });

  it('empties in the same render as the article changes, never inheriting the last one', () => {
    const { result, rerender } = renderHook(({ article }) => useOutline(article), {
      initialProps: { article: 'installing' },
    });
    act(() => {
      result.current.sink.reportSection(at('a-vite-app', 300));
      result.current.sink.reportTop(48);
    });
    rerender({ article: 'tokens' });
    expect(result.current.sections).toEqual([]);
    expect(result.current.top).toBe(0);
    // And the ids start again, so the second page is not numbered after the first.
    expect(result.current.sink.claim('react-key-9', 'a-vite-app')).toBe('a-vite-app');
  });
});

describe('a heading inside an article', () => {
  function article() {
    const outline = renderHook(() => useOutline('installing'));
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(OutlineContext.Provider, { value: outline.result.current.sink }, children);
    return { outline, wrapper };
  }

  it('reports itself where it landed, under the id its own words earn', () => {
    const { outline, wrapper } = article();
    const heading = renderHook(() => useSection(3, 'The stylesheet'), { wrapper });
    expect(heading.result.current.id).toBe('the-stylesheet');
    act(() => heading.result.current.onLayout?.(laidOutAt(900)));
    expect(outline.result.current.sections).toEqual([
      { id: 'the-stylesheet', label: 'The stylesheet', level: 3, y: 900 },
    ]);
  });

  it('is addressed as a section where it has no words of its own', () => {
    const { wrapper } = article();
    const heading = renderHook(() => useSection(2, null), { wrapper });
    expect(heading.result.current.id).toBe('section');
  });

  it('is offered no address at all outside an article', () => {
    const { result } = renderHook(() => useSection(2, 'The stylesheet'));
    expect(result.current.id).toBeUndefined();
    expect(result.current.onLayout).toBeUndefined();
  });

  it('measures every heading from where the document itself starts', () => {
    const { outline, wrapper } = article();
    const document = renderHook(() => useDocumentTop(), { wrapper });
    act(() => document.result.current?.(laidOutAt(48)));
    expect(outline.result.current.top).toBe(48);
    expect(renderHook(() => useDocumentTop()).result.current).toBeUndefined();
  });
});
