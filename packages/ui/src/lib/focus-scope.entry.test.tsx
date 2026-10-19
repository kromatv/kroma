// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFocusEntry } from '#ui/lib/focus-entry';
import { FocusScope } from '#ui/lib/focus-scope';

afterEach(cleanup);

let seen: ReturnType<typeof useFocusEntry> | null = null;

function Probe() {
  seen = useFocusEntry();
  return null;
}

const screen = (entryKey: string) => (
  <FocusScope entryKey={entryKey}>
    <Probe />
  </FocusScope>
);

describe('FocusScope entryKey', () => {
  it('hands the next screen an entry nobody has settled yet', () => {
    const { rerender } = render(screen('home'));
    seen?.markFocusSettled();
    expect(seen?.focusSettled()).toBe(true);

    rerender(screen('movie:1'));

    expect(seen?.focusSettled()).toBe(false);
  });

  it('keeps the entry while the screen stays the same', () => {
    const { rerender } = render(screen('home'));
    seen?.markFocusSettled();

    rerender(screen('home'));

    expect(seen?.focusSettled()).toBe(true);
  });
});
