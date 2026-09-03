// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFocusVisible } from '#ui/lib/focus-visible';

afterEach(() => {
  cleanup();
  fireEvent.keyDown(window, { key: 'Escape' });
});

function probe() {
  const seen: boolean[] = [];
  function Probe({ focus }: Readonly<{ focus: unknown }>) {
    seen.push(useFocusVisible(focus));
    return null;
  }
  return { Probe, seen };
}

describe('useFocusVisible', () => {
  it('shows the ring for a focus the keys asked for', () => {
    const { Probe, seen } = probe();
    const view = render(<Probe focus={false} />);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    view.rerender(<Probe focus />);

    expect(seen.at(-1)).toBe(true);
  });

  it('never shows the ring for a focus the pointer took, not even for one render', () => {
    const { Probe, seen } = probe();
    const view = render(<Probe focus={false} />);

    fireEvent.mouseMove(window);
    view.rerender(<Probe focus />);

    expect(seen).not.toContain(true);
  });

  it('counts a click as the pointer even when the cursor did not move since the last key', () => {
    const { Probe, seen } = probe();
    const view = render(<Probe focus={false} />);

    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.pointerDown(window);
    view.rerender(<Probe focus />);

    expect(seen.at(-1)).toBe(false);
  });

  it('re-reads the modality when the focus moves to another owner', () => {
    const { Probe, seen } = probe();
    const view = render(<Probe focus={false} />);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    view.rerender(<Probe focus="un" />);
    fireEvent.mouseMove(window);
    view.rerender(<Probe focus="deux" />);

    expect(seen.at(-1)).toBe(false);
  });
});
