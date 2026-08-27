// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { draggable, place } from './drag';

function host(): HTMLElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
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
    const element = host();

    place(element, 20_000, -50);

    expect(element.style.left).toBe('872px');
    expect(element.style.top).toBe('8px');
    expect(element.style.right).toBe('auto');
  });

  it('reports where it was dropped, once, at the end of the drag', () => {
    const element = host();
    const dropped = vi.fn();
    draggable(element, dropped);

    element.dispatchEvent(pointer('pointerdown', 100, 100));
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

    element.dispatchEvent(pointer('pointerdown', 100, 100));
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

    element.dispatchEvent(pointer('pointerdown', 100, 100));
    window.dispatchEvent(pointer('pointermove', 200, 200));
    window.dispatchEvent(pointer('pointerup', 200, 200));
    element.dispatchEvent(pointer('click', 200, 200));

    expect(clicked).not.toHaveBeenCalled();
  });

  it('stops listening once disposed', () => {
    const element = host();
    const dropped = vi.fn();

    draggable(element, dropped)();
    element.dispatchEvent(pointer('pointerdown', 100, 100));
    window.dispatchEvent(pointer('pointermove', 200, 200));
    window.dispatchEvent(pointer('pointerup', 200, 200));

    expect(dropped).not.toHaveBeenCalled();
  });
});
