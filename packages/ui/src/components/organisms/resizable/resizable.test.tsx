// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import { onScreen } from '#ui/testing';
import { Resizable, type ResizableLayoutDetails } from './index';
import type { ResizableStorage } from './resizable-store';

// react-native-web's `onLayout` is a ResizeObserver plus a measurement, and
// jsdom has neither: without both, a group is zero points long and no seam can
// be dragged. One handle takes 16, so the panels share exactly 1000.
const GROUP = 1016;

beforeAll(() => {
  for (const side of ['offsetWidth', 'offsetHeight'] as const) {
    Object.defineProperty(HTMLElement.prototype, side, { configurable: true, get: () => GROUP });
  }
  window.ResizeObserver = class {
    constructor(private readonly report: ResizeObserverCallback) {}
    observe(node: Element) {
      this.report([{ target: node } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

interface Sizes {
  min?: number | `${number}px`;
  collapsible?: boolean;
}

// react-native-web measures a view a task after the observer fires, so a group
// is zero points long until the queue has been let run once.
async function show(
  props: Parameters<typeof Resizable.Root>[0] = {},
  panels: Readonly<Sizes> = {},
): Promise<ReturnType<typeof vi.fn>> {
  const changed = vi.fn();
  render(
    onScreen(
      <Resizable.Root onLayoutChange={changed} {...props}>
        <Resizable.Panel minSize={panels.min} collapsible={panels.collapsible}>
          <Text>One</Text>
        </Resizable.Panel>
        <Resizable.Handle label="Resize" />
        <Resizable.Panel>
          <Text>Two</Text>
        </Resizable.Panel>
      </Resizable.Root>,
    ),
  );
  await act(async () => {
    await new Promise((settled) => setTimeout(settled, 0));
  });
  return changed;
}

const lastLayout = (changed: ReturnType<typeof vi.fn>): number[] =>
  changed.mock.calls.at(-1)?.[0] as number[];

const lastDetails = (changed: ReturnType<typeof vi.fn>): ResizableLayoutDetails =>
  changed.mock.calls.at(-1)?.[1] as ResizableLayoutDetails;

// PanResponder ignores a move it has already accounted for, and it tells them
// apart by timestamp - which jsdom hands out in whole milliseconds, so events
// fired back to back share one. Each gets its own here.
function mouse(kind: string, node: Element, init: MouseEventInit, stamp: number) {
  const event = new MouseEvent(kind, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'timeStamp', { value: stamp });
  fireEvent(node, event);
}

// The strip carrying the gesture, one level out from the control that carries
// the focus. The responder is claimed on the first move, which is why that one
// is aimed at the strip and the rest are not: past the claim the gesture
// follows the pointer wherever it goes.
function drag(by: number, upTo = true) {
  const strip = screen.getByLabelText('Resize').parentElement as HTMLElement;
  const claimed = Math.sign(by) * 6;
  mouse('mousedown', strip, { clientX: 100, clientY: 100, button: 0 }, 1000);
  mouse('mousemove', strip, { clientX: 100 + claimed, clientY: 100, buttons: 1 }, 1010);
  mouse('mousemove', document.body, { clientX: 100 + by, clientY: 100, buttons: 1 }, 1020);
  if (upTo) mouse('mouseup', document.body, { clientX: 100 + by, clientY: 100 }, 1030);
}

const grab = () => fireEvent.click(screen.getByLabelText('Resize'));

// `false` back from fireEvent means the seam called preventDefault, which is
// how the spatial navigator is kept from moving focus out from under it.
const key = (name: string) => fireEvent.keyDown(document, { key: name });

const rule = () => document.querySelector('style[data-kroma-resize]')?.textContent ?? '';

function memoryStore(): ResizableStorage & { held: Map<string, string> } {
  const held = new Map<string, string>();
  return {
    held,
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => {
      held.set(key, value);
    },
  };
}

afterEach(cleanup);

describe('Resizable', () => {
  it('opens on the layout the panels themselves describe', async () => {
    const changed = await show();
    expect(lastLayout(changed)).toEqual([50, 50]);
    expect(lastDetails(changed)).toEqual({ committed: true, user: false });
    expect(screen.getByText('One')).toBeTruthy();
  });

  it('announces the share it has given the panel before it', async () => {
    const changed = await show();
    const seam = screen.getByLabelText('Resize');
    expect(seam.getAttribute('role')).toBe('slider');
    expect(seam.getAttribute('aria-valuenow')).toBe('50');
    drag(-206);
    expect(lastLayout(changed)).toEqual([30, 70]);
    expect(screen.getByLabelText('Resize').getAttribute('aria-valuenow')).toBe('30');
  });

  // The first two points of a gesture are still a press, so a drag is measured
  // from where the responder was granted rather than from where the finger
  // landed: 100 across the group moves the seam by the 94 past the slop.
  it('moves the seam with the pointer', async () => {
    const changed = await show();
    drag(100);
    expect(lastLayout(changed)).toEqual([59.4, 40.6]);
    expect(lastDetails(changed).committed).toBe(true);
  });

  it('reports every frame of a drag before it reports the end of one', async () => {
    const changed = await show();
    drag(100, false);
    expect(lastDetails(changed)).toEqual({ committed: false, user: true });
    mouse('mouseup', document.body, { clientX: 200, clientY: 100 }, 1030);
    expect(lastDetails(changed)).toEqual({ committed: true, user: true });
  });

  it('stops where the panel it is taking from runs out', async () => {
    const changed = await show({}, { min: 30 });
    drag(-400);
    expect(lastLayout(changed)).toEqual([30, 70]);
  });

  it('reads a floor stated in points against the group it was measured for', async () => {
    const changed = await show({}, { min: '400px' });
    drag(-400);
    expect(lastLayout(changed)).toEqual([40, 60]);
  });

  // The cursor has to survive the pointer crossing a button or a run of prose,
  // each of which carries its own; an inline cursor on the body loses to both.
  it('holds the resize cursor over every element for the length of a drag', async () => {
    await show();
    expect(rule()).toBe('');
    drag(100, false);
    expect(rule()).toContain('col-resize !important');
    expect(rule()).toMatch(/^\*, \*::before, \*::after/);
    mouse('mouseup', document.body, { clientX: 200, clientY: 100 }, 1030);
    expect(document.querySelector('style[data-kroma-resize]')).toBeNull();
  });

  it('gives the page back when a drag is cut short by an unmount', async () => {
    await show();
    drag(100, false);
    expect(document.querySelector('style[data-kroma-resize]')).not.toBeNull();
    cleanup();
    expect(document.querySelector('style[data-kroma-resize]')).toBeNull();
  });

  it('takes the arrow keys once the seam is pressed, and moves on them', async () => {
    const changed = await show();
    grab();
    expect(key('ArrowRight')).toBe(false);
    expect(lastLayout(changed)).toEqual([52.4, 47.6]);
  });

  it('leaves the keys alone until the seam is taken', async () => {
    const changed = await show();
    expect(key('ArrowRight')).toBe(true);
    expect(lastLayout(changed)).toEqual([50, 50]);
  });

  it('swallows the cross axis while held rather than moving on it', async () => {
    const changed = await show();
    grab();
    expect(key('ArrowUp')).toBe(false);
    expect(lastLayout(changed)).toEqual([50, 50]);
  });

  it('gives the keys back on Escape', async () => {
    await show();
    grab();
    key('Escape');
    expect(key('ArrowRight')).toBe(true);
  });

  it('puts its two panels back on a second press', async () => {
    const changed = await show();
    grab();
    key('ArrowRight');
    expect(lastLayout(changed)).toEqual([52.4, 47.6]);
    grab();
    expect(lastLayout(changed)).toEqual([50, 50]);
    expect(key('ArrowRight')).toBe(true);
  });

  it('fixes every seam in a disabled group', async () => {
    const changed = await show({ disabled: true });
    drag(100);
    grab();
    expect(key('ArrowRight')).toBe(true);
    expect(lastLayout(changed)).toEqual([50, 50]);
  });

  it('keeps a dragged layout under the arrangement it was dragged in', async () => {
    const store = memoryStore();
    const changed = await show({ autoSaveId: 'panes', storage: store });
    drag(100);
    expect(store.held.get('panes')).toBe(JSON.stringify({ 'horizontal:2': lastLayout(changed) }));
  });

  it('opens on what the last visit left', async () => {
    const store = memoryStore();
    store.held.set('panes', JSON.stringify({ 'horizontal:2': [70, 30] }));
    expect(lastLayout(await show({ autoSaveId: 'panes', storage: store }))).toEqual([70, 30]);
  });

  it('ignores a stored layout that is not a list of sizes', async () => {
    const store = memoryStore();
    store.held.set('panes', '{"horizontal:2":["wide","narrow"]}');
    expect(lastLayout(await show({ autoSaveId: 'panes', storage: store }))).toEqual([50, 50]);
  });

  it('takes a layout from its caller, and never writes one of its own', async () => {
    const changed = await show({ layout: [80, 20] });
    expect(lastLayout(changed)).toEqual([80, 20]);
    drag(100);
    expect(lastDetails(changed).user).toBe(true);
    expect(lastLayout(changed)).toEqual([89.4, 10.6]);
    // Controlled: the group still says what it would be, and stays where its
    // caller put it until the caller says otherwise.
    expect(screen.getByLabelText('Resize')).toBeTruthy();
  });

  it('shuts a collapsible panel a drag takes past halfway, and opens it again', async () => {
    const changed = await show({}, { min: 30, collapsible: true });
    drag(-400);
    expect(lastLayout(changed)).toEqual([0, 100]);
    drag(200);
    expect(lastLayout(changed)).toEqual([30, 70]);
  });

  it('refuses a panel that is not a direct child of the Root', () => {
    expect(() =>
      render(
        <Resizable.Panel>
          <Text>Liste</Text>
        </Resizable.Panel>,
      ),
    ).toThrow('<Resizable.Panel> must be a direct child of <Resizable.Root>');
  });

  it('refuses a handle that is not a direct child of the Root', () => {
    expect(() => render(<Resizable.Handle label="Resize" />)).toThrow(
      '<Resizable.Handle> must be a direct child of <Resizable.Root>',
    );
  });
});
