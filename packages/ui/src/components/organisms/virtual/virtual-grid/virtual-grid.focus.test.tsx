// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { act, StrictMode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Focusable } from '#ui/components/atoms/focusable';
import { configureRemote } from '#ui/lib/focus-remote';
import { layout, onScreen } from '#ui/testing';
import { VirtualGrid } from './virtual-grid';

beforeAll(() => configureRemote());
afterEach(cleanup);

const ROW = 68;
const GAP = 8;
const ROWS = 7;
const LIST = ROW * ROWS + GAP * (ROWS - 1);
const OPTIONS = Array.from({ length: 300 }, (_, at) => `row ${at}`);

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

function ringed(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[role="button"]')]
    .filter((el) => el.style.boxShadow !== '')
    .map((el) => el.getAttribute('aria-label') ?? '');
}

const mounted = () =>
  [...document.querySelectorAll('[role="button"]')].map((el) => el.getAttribute('aria-label'));

function open(initialIndex: number) {
  const view = render(
    <StrictMode>
      {onScreen(
        <VirtualGrid
          data={OPTIONS}
          columns={1}
          itemHeight={ROW}
          rowGap={GAP}
          width={520}
          style={{ height: LIST, width: 520 }}
          initialIndex={initialIndex}
          renderItem={(option) => (
            <Focusable label={option} style={{ width: 520, height: ROW }}>
              {null}
            </Focusable>
          )}
        />,
      )}
    </StrictMode>,
  );
  layout(view.container.firstElementChild as Element, { width: 520, height: LIST });
  return view;
}

describe('a windowed grid opened on a row', () => {
  it('puts the ring on that row and nowhere else', () => {
    open(120);

    expect(ringed()).toEqual(['row 120']);
  });

  it('opens on the first row when that is the one asked for', () => {
    open(0);

    expect(ringed()).toEqual(['row 0']);
  });

  it('walks a row at a time, mounting what it walks onto', () => {
    open(120);

    for (let step = 0; step < 10; step += 1) press('ArrowDown');

    expect(ringed()).toEqual(['row 130']);
    expect(mounted()).toContain('row 130');
  });

  it('walks back up through the page it came from', () => {
    open(120);

    for (let step = 0; step < 4; step += 1) press('ArrowUp');

    expect(ringed()).toEqual(['row 116']);
  });

  it('shows every row of the page before the strip moves', () => {
    open(0);

    for (let step = 0; step < ROWS - 1; step += 1) press('ArrowDown');

    expect(ringed()).toEqual([`row ${ROWS - 1}`]);
    expect(strip()).toBe(0);
  });

  it('moves the strip by a whole page once the ring leaves it', () => {
    open(0);

    for (let step = 0; step < ROWS; step += 1) press('ArrowDown');

    expect(strip()).toBe((ROW + GAP) * ROWS);
  });
});

function openWithHeader(initialIndex: number) {
  const view = render(
    <StrictMode>
      {onScreen(
        <VirtualGrid
          data={OPTIONS}
          columns={1}
          itemHeight={ROW}
          rowGap={GAP}
          width={520}
          style={{ height: LIST, width: 520 }}
          header={
            <Focusable label="the header" style={{ width: 520, height: ROW }}>
              {null}
            </Focusable>
          }
          headerHeight={ROW}
          initialIndex={initialIndex}
          renderItem={(option) => (
            <Focusable label={option} style={{ width: 520, height: ROW }}>
              {null}
            </Focusable>
          )}
        />,
      )}
    </StrictMode>,
  );
  layout(view.container.firstElementChild as Element, { width: 520, height: LIST });
  return view;
}

describe('a grid whose first row is its header', () => {
  it('opens on the header, which is row 0 like any other', () => {
    openWithHeader(0);

    expect(ringed()).toEqual(['the header']);
  });

  it('counts the header when a data row is the one asked for', () => {
    openWithHeader(1);

    expect(ringed()).toEqual(['row 0']);
  });
});

// The strip is translated rather than scrolled, so how far the list has
// travelled is readable only off its transform.
function strip(): number {
  for (const node of document.querySelectorAll<HTMLElement>('div')) {
    const match = /translateY\((-?[\d.]+)px\)/.exec(node.style.transform);
    if (match?.[1]) return -Number(match[1]) || 0;
  }
  return 0;
}
