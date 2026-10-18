// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createInputSource } from './input-source';

describe('input source ownership', () => {
  it('tracks pointer input until a key takes over', () => {
    const source = createInputSource();
    const stop = source.retain();
    try {
      expect(source.pointerDriving()).toBe(false);
      for (const kind of ['mousemove', 'wheel', 'pointerdown']) {
        window.dispatchEvent(new Event(kind));
        expect(source.pointerDriving()).toBe(true);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        expect(source.pointerDriving()).toBe(false);
      }
    } finally {
      stop();
    }
  });

  it('keeps nested hosts listening until their last lease ends', () => {
    const source = createInputSource();
    const first = source.retain();
    const second = source.retain();
    first();
    first();
    window.dispatchEvent(new Event('wheel'));
    expect(source.pointerDriving()).toBe(true);
    second();
    expect(source.pointerDriving()).toBe(false);
    window.dispatchEvent(new Event('wheel'));
    expect(source.pointerDriving()).toBe(false);
  });

  it('starts a fresh root independently and removes only its own listeners', () => {
    const first = createInputSource();
    const stopFirst = first.retain();
    window.dispatchEvent(new Event('mousemove'));
    const second = createInputSource();
    expect(second.pointerDriving()).toBe(false);
    const stopSecond = second.retain();
    stopFirst();
    window.dispatchEvent(new Event('pointerdown'));
    expect(first.pointerDriving()).toBe(false);
    expect(second.pointerDriving()).toBe(true);
    stopSecond();
  });
});
