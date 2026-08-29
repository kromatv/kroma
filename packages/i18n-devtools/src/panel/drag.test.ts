// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { draggable, keepInView, place } from './drag';

function host(width = 0, height = 0): HTMLElement {
  const element = document.createElement('div');
  element.innerHTML = '<span data-kroma-i18n-grip></span>';
  element.getBoundingClientRect = () => ({ width, height, left: 0, top: 0 }) as unknown as DOMRect;
  document.body.append(element);
  return element;
}

function grip(element: HTMLElement): Element {
  return element.querySelector('[data-kroma-i18n-grip]') as Element;
}

function pointer(type: string, x: number, y: number): PointerEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }) as PointerEvent;
}

beforeEach(() => {
  document.body.innerHTML = '';
  window.innerWidth = 1000;
  window.innerHeight = 800;
});

describe('dragging the tools', () => {
  it('anchors to a corner by coordinates, inside the viewport', () => {
    const element = host(300, 340);

    place(element, 20_000, -50);

    expect(element.style.left).toBe('692px');
    expect(element.style.top).toBe('8px');
    expect(element.style.right).toBe('auto');
  });

  it('follows no pointer until the grip is taken', () => {
    const element = host();
    const dropped = vi.fn();
    draggable(element, dropped);

    window.dispatchEvent(pointer('pointermove', 160, 140));
    window.dispatchEvent(pointer('pointerup', 160, 140));

    expect([dropped.mock.calls.length, element.style.left]).toEqual([0, '']);
  });

  it('reports where it was dropped, once, at the end of the drag', () => {
    const element = host();
    const dropped = vi.fn();
    draggable(element, dropped);

    grip(element).dispatchEvent(pointer('pointerdown', 100, 100));
    window.dispatchEvent(pointer('pointermove', 160, 140));
    window.dispatchEvent(pointer('pointerup', 160, 140));

    expect(dropped).toHaveBeenCalledTimes(1);
  });

  it('leaves a press alone, so the badge still opens the panel', () => {
    const element = host();
    const dropped = vi.fn();
    const clicked = vi.fn();
    element.addEventListener('click', clicked);
    draggable(element, dropped);

    grip(element).dispatchEvent(pointer('pointerdown', 100, 100));
    window.dispatchEvent(pointer('pointermove', 101, 101));
    window.dispatchEvent(pointer('pointerup', 101, 101));
    element.dispatchEvent(pointer('click', 101, 101));

    expect(dropped).not.toHaveBeenCalled();
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('swallows the click a real drag would otherwise become', () => {
    const element = host();
    const clicked = vi.fn();
    element.addEventListener('click', clicked);
    draggable(element, vi.fn());

    grip(element).dispatchEvent(pointer('pointerdown', 100, 100));
    window.dispatchEvent(pointer('pointermove', 200, 200));
    window.dispatchEvent(pointer('pointerup', 200, 200));
    element.dispatchEvent(pointer('click', 200, 200));

    expect(clicked).not.toHaveBeenCalled();
  });

  it('leaves a press anywhere but the grip alone, so the panel controls still work', () => {
    const element = host(300, 340);
    const dropped = vi.fn();
    draggable(element, dropped);

    element.dispatchEvent(pointer('pointerdown', 100, 100));
    window.dispatchEvent(pointer('pointermove', 300, 300));
    window.dispatchEvent(pointer('pointerup', 300, 300));

    expect(dropped).not.toHaveBeenCalled();
    expect(element.style.left).toBe('');
  });

  it('stops listening once disposed', () => {
    const element = host();
    const dropped = vi.fn();

    draggable(element, dropped)();
    grip(element).dispatchEvent(pointer('pointerdown', 100, 100));
    window.dispatchEvent(pointer('pointermove', 200, 200));
    window.dispatchEvent(pointer('pointerup', 200, 200));

    expect(dropped).not.toHaveBeenCalled();
  });
});

describe('keeping the tools in view', () => {
  it('pulls a panel a smaller window has pushed off the edge back in', () => {
    const element = host(300, 340);
    place(element, 690, 450);
    keepInView(element);

    window.innerWidth = 600;
    window.innerHeight = 500;
    window.dispatchEvent(new Event('resize'));

    expect(element.style.left).toBe('292px');
    expect(element.style.top).toBe('152px');
  });

  it('watches its own size where the platform has a ResizeObserver', () => {
    const watched: unknown[] = [];
    let disconnected = 0;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(target: unknown) {
          watched.push(target);
        }
        disconnect() {
          disconnected += 1;
        }
      },
    );
    const element = host(300, 340);

    keepInView(element)();
    vi.unstubAllGlobals();

    expect([watched, disconnected]).toEqual([[element], 1]);
  });

  it('leaves a badge that never moved anchored to its corner', () => {
    const element = host(84, 40);
    keepInView(element);

    window.dispatchEvent(new Event('resize'));

    expect(element.style.left).toBe('');
    expect(element.style.right).toBe('');
  });

  it('stops listening once disposed', () => {
    const element = host(300, 340);
    place(element, 100, 100);

    keepInView(element)();
    window.innerWidth = 200;
    window.dispatchEvent(new Event('resize'));

    expect(element.style.left).toBe('100px');
  });
});
