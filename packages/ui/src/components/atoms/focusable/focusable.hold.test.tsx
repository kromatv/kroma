// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureRemote } from '#ui/lib/focus-remote';
import { FocusScope } from '#ui/lib/focus-scope';
import { armPressGuard, clearPressGuard } from '#ui/lib/press-guard';
import { Focusable } from './focusable';

beforeAll(() => configureRemote());

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  cleanup();
  clearPressGuard();
  vi.useRealTimers();
});

function key(kind: 'keydown' | 'keyup') {
  act(() => {
    document.dispatchEvent(new KeyboardEvent(kind, { key: 'Enter', bubbles: true }));
  });
}

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function control() {
  const onPress = vi.fn();
  const onLongPress = vi.fn();
  render(
    <FocusScope>
      <Focusable label="Silo" autoFocus onPress={onPress} onLongPress={onLongPress} />
    </FocusScope>,
  );
  return { onPress, onLongPress };
}

describe('Focusable held on a remote', () => {
  it('fires onLongPress once OK has been down for half a second, and never onPress', () => {
    const { onPress, onLongPress } = control();

    key('keydown');
    wait(500);
    key('keyup');

    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('fires onPress on a quick OK, once the key is back up', () => {
    const { onPress, onLongPress } = control();

    key('keydown');
    const early = onPress.mock.calls.length;
    key('keyup');

    expect(early).toBe(0);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('swallows a hold that carried over from the previous screen', () => {
    const { onLongPress } = control();
    armPressGuard();

    key('keydown');
    wait(500);
    key('keyup');

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
