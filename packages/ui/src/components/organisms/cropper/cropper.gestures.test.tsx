// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { onScreen } from '#ui/testing';
import { Cropper, type CropperRootProps, type CropperState, useCropper } from './index';

vi.mock('#ui/lib/image-size', () => ({
  imageSize: () => Promise.resolve({ width: 400, height: 200 }),
}));

const FRAME = 200;
const PHOTO = 'https://kroma.test/photo.jpg';

beforeAll(() => {
  for (const side of ['offsetWidth', 'offsetHeight'] as const) {
    Object.defineProperty(HTMLElement.prototype, side, { configurable: true, get: () => FRAME });
  }
  window.ResizeObserver = class {
    constructor(private readonly report: ResizeObserverCallback) {}
    observe(node: Element) {
      this.report([{ target: node } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  };
});

const held: { cropper: CropperState | null } = { cropper: null };

function Probe() {
  const state = useCropper();
  useLayoutEffect(() => {
    held.cropper = state;
  });
  return null;
}

const cropper = (): CropperState => {
  if (!held.cropper) {
    throw new Error('no cropper mounted');
  }
  return held.cropper;
};

const settle = () =>
  act(async () => {
    await new Promise((settled) => setTimeout(settled, 0));
  });

async function show(props: Partial<CropperRootProps> = {}) {
  render(
    onScreen(
      <Cropper.Root src={PHOTO} {...props}>
        <Cropper.Frame />
        <Probe />
      </Cropper.Root>,
    ),
  );
  await settle();
}

const frame = () => screen.getByLabelText('Crop');
const picture = () => frame().querySelector('img')?.parentElement?.parentElement as HTMLElement;
const surface = () => picture().parentElement as HTMLElement;

function mouse(kind: string, node: Element | Document, init: MouseEventInit, stamp: number) {
  const event = new MouseEvent(kind, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'timeStamp', { value: stamp });
  fireEvent(node, event);
}

function drag(dx: number, dy: number) {
  mouse('mousedown', surface(), { clientX: 100, clientY: 100, button: 0 }, 1000);
  mouse('mousemove', document.body, { clientX: 100 + dx, clientY: 100 + dy, buttons: 1 }, 1010);
  mouse('mouseup', document.body, { clientX: 100 + dx, clientY: 100 + dy }, 1020);
}

type Point = readonly [number, number];

function touch(kind: string, points: readonly Point[], stamp: number, changedFrom = 0) {
  const node = surface();
  const touches = points.map(([pageX, pageY], identifier) => ({
    identifier,
    pageX,
    pageY,
    clientX: pageX,
    clientY: pageY,
    target: node,
  }));
  const event = new Event(kind, { bubbles: true, cancelable: true });
  Object.assign(event, {
    touches,
    targetTouches: touches,
    changedTouches: touches.slice(changedFrom),
  });
  Object.defineProperty(event, 'timeStamp', { value: stamp });
  fireEvent(node, event);
}

function wheel(deltaY: number) {
  act(() => {
    surface().dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
  });
}

afterEach(() => {
  cleanup();
  held.cropper = null;
  vi.clearAllMocks();
});

describe('the Cropper frame under a pointer', () => {
  it('pans with a drag, by the share of the frame it crossed', async () => {
    await show();

    drag(50, 30);

    expect(cropper().transform.x).toBeCloseTo(0.25);
    expect(cropper().transform.y).toBe(0);
  });

  it('zooms with a pinch, by how far the two fingers spread', async () => {
    await show();

    touch(
      'touchstart',
      [
        [80, 100],
        [120, 100],
      ],
      1000,
    );
    touch(
      'touchmove',
      [
        [60, 100],
        [140, 100],
      ],
      1010,
    );

    expect(cropper().transform.zoom).toBeCloseTo(2);
  });

  it('carries on from where it is when a second finger joins a drag', async () => {
    await show();

    touch('touchstart', [[100, 100]], 1000);
    touch('touchmove', [[120, 100]], 1010);
    expect(cropper().transform.x).toBeCloseTo(0.1);
    touch(
      'touchstart',
      [
        [120, 100],
        [160, 100],
      ],
      1020,
      1,
    );
    touch(
      'touchmove',
      [
        [120, 100],
        [160, 100],
      ],
      1030,
    );
    touch(
      'touchmove',
      [
        [110, 100],
        [170, 100],
      ],
      1040,
    );

    expect(cropper().transform.zoom).toBeCloseTo(1.5);
    expect(cropper().transform.x).toBeCloseTo(0.15);
  });

  it('never presses the frame with the click a drag ends in', async () => {
    await show();

    fireEvent.click(surface());

    expect(frame().getAttribute('aria-pressed')).toBe('false');
  });

  it('zooms on the wheel, in on the way up', async () => {
    await show();

    wheel(-500);
    expect(cropper().transform.zoom).toBeCloseTo(1.5);
    wheel(200);
    expect(cropper().transform.zoom).toBeCloseTo(1.3);
  });

  it('dims everything outside the circle', async () => {
    await show({ shape: 'circle' });

    const dim = surface().querySelector('svg');

    expect(dim?.querySelector('path')?.getAttribute('fill-rule')).toBe('evenodd');
    expect(dim?.querySelector('path')?.getAttribute('d')).toContain(`a${FRAME / 2} ${FRAME / 2}`);
    expect(dim?.querySelector('circle')?.getAttribute('r')).toBe(String(FRAME / 2 - 0.5));
  });

  it('dims nothing around a rectangle', async () => {
    await show({ shape: 'rect' });

    expect(surface().querySelector('svg')).toBeNull();
  });
});
