// @vitest-environment jsdom

import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useKeyGrace } from '#ui/lib/key-grace.hook';

function press(init: { key?: string; keyCode: number }) {
  const event = new KeyboardEvent('keydown', { cancelable: true });
  Object.defineProperty(event, 'key', { value: init.key });
  Object.defineProperty(event, 'keyCode', { value: init.keyCode });
  document.dispatchEvent(event);
}

afterEach(cleanup);

describe('useKeyGrace', () => {
  it('counts an arrow a browser names', () => {
    const { result } = renderHook(() => useKeyGrace(true));

    press({ key: 'ArrowRight', keyCode: 39 });

    expect(result.current()).toBe(true);
  });

  it('counts an arrow an engine reports by keyCode alone', () => {
    const { result } = renderHook(() => useKeyGrace(true));

    press({ keyCode: 37 });

    expect(result.current()).toBe(true);
  });

  it('does not count a key that moves nothing sideways', () => {
    const { result } = renderHook(() => useKeyGrace(true));

    press({ keyCode: 40 });

    expect(result.current()).toBe(false);
  });

  it('listens to nothing outside a focus scope', () => {
    const { result } = renderHook(() => useKeyGrace(false));

    press({ key: 'ArrowLeft', keyCode: 37 });

    expect(result.current()).toBe(false);
  });
});
