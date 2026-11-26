// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { RING_ROOM } from '#ui/core/tokens';
import { FocusColumn, FocusScope } from './focus-scope.component';
import { FocusScrollView } from './focus-scroll-view.component';
import { PageScrollContext, RailScrollContext } from './reveal-contexts';

const ROW = 100;
const ROWS = 10;
const VIEWPORT = 450;

const geometry = new WeakMap<Element, { top: number; height: number }>();
const observed = new Set<Element>();
type Notify = (entries: readonly { target: Element }[]) => void;

let notify: Notify = () => {};

class LayoutObserver {
  constructor(callback: Notify) {
    notify = callback;
  }
  observe(node: Element) {
    observed.add(node);
  }
  unobserve(node: Element) {
    observed.delete(node);
  }
  disconnect() {
    observed.clear();
  }
}

const descriptors = {
  offsetTop: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop'),
  offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
};

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', LayoutObserver);
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get() {
      return geometry.get(this)?.top ?? 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return geometry.get(this)?.height ?? 0;
    },
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
  for (const [name, descriptor] of Object.entries(descriptors)) {
    if (descriptor) {
      Object.defineProperty(HTMLElement.prototype, name, descriptor);
    }
  }
});

afterEach(() => {
  cleanup();
  observed.clear();
});

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

async function press(key: string, times = 1) {
  for (let at = 0; at < times; at += 1) {
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
  }
  await settle();
}

function List() {
  return (
    <FocusScope>
      <FocusScrollView>
        <Box testID="list">
          <FocusColumn>
            {Array.from({ length: ROWS }, (_, at) => (
              <Focusable key={at} label={`Row ${at}`} autoFocus={at === 0} />
            ))}
          </FocusColumn>
        </Box>
      </FocusScrollView>
    </FocusScope>
  );
}

async function laidOut() {
  const content = screen.getByTestId('list').parentElement?.parentElement;
  const scroller = content?.parentElement;
  if (!content || !scroller) {
    throw new Error('the list is not inside a scroll view');
  }
  geometry.set(scroller, { top: 0, height: VIEWPORT });
  geometry.set(content, { top: 0, height: ROW * ROWS });
  for (let at = 0; at < ROWS; at += 1) {
    geometry.set(screen.getByLabelText(`Row ${at}`), { top: at * ROW, height: ROW });
  }
  const scroll = vi.fn();
  Object.assign(scroller, { scroll });
  notify([...observed].map((target) => ({ target })));
  await settle();
  return scroll;
}

const lastTop = (scroll: ReturnType<typeof vi.fn>) => scroll.mock.lastCall?.[0]?.top;

describe('FocusScrollView', () => {
  it('scrolls a row the focus reaches below the fold just into view', async () => {
    render(<List />);
    const scroll = await laidOut();

    await press('ArrowDown', 4);

    expect(lastTop(scroll)).toBe(4 * ROW + ROW + RING_ROOM - VIEWPORT);
  });

  it('shows the end of the content for the last row and the start for the first', async () => {
    render(<List />);
    const scroll = await laidOut();

    await press('ArrowDown', ROWS - 1);
    const atEnd = lastTop(scroll);
    await press('ArrowUp', ROWS - 1);

    expect(atEnd).toBe(ROW * ROWS - VIEWPORT);
    expect(lastTop(scroll)).toBe(0);
  });

  it('never asks a page or a rail behind it to scroll', async () => {
    const page = vi.fn();
    const rail = vi.fn();
    render(
      <PageScrollContext value={page}>
        <RailScrollContext value={rail}>
          <List />
        </RailScrollContext>
      </PageScrollContext>,
    );
    await laidOut();

    await press('ArrowDown');

    expect(page).not.toHaveBeenCalled();
    expect(rail).not.toHaveBeenCalled();
  });
});
