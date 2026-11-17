// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFrostEngine } from './engine.web';

const observed: Element[] = [];

class RecordingResizeObserver {
  observe(target: Element) {
    observed.push(target);
  }
  unobserve(target: Element) {
    observed.splice(observed.indexOf(target), 1);
  }
  disconnect() {
    observed.length = 0;
  }
}

function frame() {
  const root = document.createElement('div');
  const canvas = document.createElement('canvas');
  const surface = document.createElement('div');
  const mark = document.createElement('span');
  surface.append(mark);
  root.append(canvas, surface);
  document.body.append(root);
  return { root, canvas, surface, mark };
}

afterEach(() => {
  document.body.replaceChildren();
  observed.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createFrostEngine', () => {
  it('opens on an engine that has no ResizeObserver', () => {
    const { root, canvas } = frame();

    vi.stubGlobal('ResizeObserver', undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    expect(() => createFrostEngine(canvas, root, () => {}).dispose()).not.toThrow();
  });

  it('frosts a surface on an engine that has no ResizeObserver', () => {
    const { root, canvas, surface, mark } = frame();

    vi.stubGlobal('ResizeObserver', undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    createFrostEngine(canvas, root, () => {}).register(mark);

    expect(surface.hasAttribute('data-kroma-frost')).toBe(true);
  });

  it('watches the canvas and every frosted surface where the engine has one', () => {
    const { root, canvas, surface, mark } = frame();

    vi.stubGlobal('ResizeObserver', RecordingResizeObserver);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    createFrostEngine(canvas, root, () => {}).register(mark);

    expect(observed).toEqual([canvas, surface]);
  });

  it('stops watching a surface once it leaves the layer', () => {
    const { root, canvas, mark } = frame();

    vi.stubGlobal('ResizeObserver', RecordingResizeObserver);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    createFrostEngine(canvas, root, () => {}).register(mark)();

    expect(observed).toEqual([canvas]);
  });
});
