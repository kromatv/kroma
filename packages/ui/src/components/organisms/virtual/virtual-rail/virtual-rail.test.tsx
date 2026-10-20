// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import { VirtualRail } from './virtual-rail';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => vi.runOnlyPendingTimers());
  cleanup();
  vi.useRealTimers();
});

const DATA = Array.from({ length: 24 }, (_, i) => `Tile ${i}`);

const rail = (data: readonly string[]) => (
  <VirtualRail
    data={data}
    itemWidth={200}
    style={{ height: 300 }}
    renderItem={(label) => <Text>{label}</Text>}
  />
);

function mount() {
  const { container } = render(rail(DATA));
  return container;
}

function flingTo(container: HTMLElement, scrollLeft: number): void {
  const scroller = container.firstElementChild?.firstElementChild as HTMLElement;
  fireEvent.scroll(scroller, { target: { scrollLeft } });
}

describe('a rail whose rows arrive after it does', () => {
  it('mounts the tiles it is handed, however far it reached while empty', () => {
    const { container, rerender } = render(rail([]));
    flingTo(container, 2_000);

    rerender(rail(DATA));

    expect(container.textContent).toContain('Tile 0');
  });
});

describe('an unscoped rail', () => {
  it('renders a real scroller, not a translated row', () => {
    const container = mount();
    expect(container.querySelector('[style*="translate"]')).toBeNull();
  });

  it('leaves a vertical wheel to the browser', () => {
    const container = mount();
    const over = container.querySelector('div') as HTMLElement;
    const event = new WheelEvent('wheel', { deltaY: 300, cancelable: true, bubbles: true });
    over.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves a horizontal wheel to the browser too', () => {
    const container = mount();
    const over = container.querySelector('div') as HTMLElement;
    const event = new WheelEvent('wheel', { deltaX: 300, cancelable: true, bubbles: true });
    over.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('puts no mask over the row, so a frosted tile still has a backdrop to sample', () => {
    const container = mount();

    const masked = [...container.querySelectorAll('*')].filter(
      (el) => (el as HTMLElement).style.maskImage !== '',
    );

    expect(masked).toHaveLength(0);
  });
});
