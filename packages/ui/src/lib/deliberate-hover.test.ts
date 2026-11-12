// @vitest-environment jsdom

import { cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDeliberateHover } from './deliberate-hover';

function hovering() {
  const onHover = vi.fn();
  const { result, rerender } = renderHook(({ handler }) => useDeliberateHover<string>(handler), {
    initialProps: { handler: onHover },
  });
  return { onHover, hover: (row: string) => result.current(row), rerender };
}

const move = () => fireEvent.mouseMove(document);
const press = () => fireEvent.keyDown(document, { key: 'ArrowDown' });

afterEach(cleanup);

describe('useDeliberateHover', () => {
  it('ignores a row that arrives under a pointer that never moved', () => {
    const { onHover, hover } = hovering();

    hover('under the pointer');

    expect(onHover).not.toHaveBeenCalled();
  });

  it('follows the pointer once it has moved', () => {
    const { onHover, hover } = hovering();

    move();
    hover('row');

    expect(onHover).toHaveBeenCalledWith('row');
  });

  it('picks up the row it was resting on when it finally moves', () => {
    const { onHover, hover } = hovering();

    hover('rested on');
    move();

    expect(onHover).toHaveBeenCalledWith('rested on');
  });

  it('picks that row up only once', () => {
    const { onHover, hover } = hovering();

    hover('rested on');
    move();
    move();

    expect(onHover).toHaveBeenCalledTimes(1);
  });

  it('counts the pointer as at rest again after a key press', () => {
    const { onHover, hover } = hovering();

    move();
    press();
    hover('slid under the pointer while typing');

    expect(onHover).not.toHaveBeenCalled();
  });

  it('calls the latest handler', () => {
    const { onHover, hover, rerender } = hovering();
    const newer = vi.fn();

    rerender({ handler: newer });
    move();
    hover('row');

    expect(newer).toHaveBeenCalledWith('row');
    expect(onHover).not.toHaveBeenCalled();
  });
});
