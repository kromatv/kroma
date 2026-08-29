// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useShortcut } from './use-shortcut';

function Listening({ run, onDismiss }: { run: () => void; onDismiss?: () => void }) {
  useShortcut([{ code: 'KeyK', run }], onDismiss);
  return null;
}

function press(init: KeyboardEventInit): void {
  window.dispatchEvent(new KeyboardEvent('keydown', init));
}

describe('the chords the panel answers', () => {
  it('runs the one whose chord was pressed', () => {
    const run = vi.fn();
    render(<Listening run={run} />);

    press({ code: 'KeyK', ctrlKey: true, altKey: true });

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('dismisses on Escape', () => {
    const onDismiss = vi.fn();
    render(<Listening run={vi.fn()} onDismiss={onDismiss} />);

    press({ key: 'Escape' });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('takes Escape from a caller that named nothing to do with it', () => {
    const run = vi.fn();
    render(<Listening run={run} />);

    press({ key: 'Escape' });

    expect(run).not.toHaveBeenCalled();
  });

  it('ignores a key held down rather than pressed', () => {
    const run = vi.fn();
    render(<Listening run={run} />);

    press({ code: 'KeyK', ctrlKey: true, altKey: true, repeat: true });

    expect(run).not.toHaveBeenCalled();
  });

  it('leaves a chord alone while someone is typing', () => {
    const run = vi.fn();
    render(<Listening run={run} />);
    const field = document.body.appendChild(document.createElement('input'));
    field.focus();

    field.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyK', ctrlKey: true, altKey: true, bubbles: true }),
    );

    expect(run).not.toHaveBeenCalled();
  });

  it('ignores a key no shortcut named', () => {
    const run = vi.fn();
    render(<Listening run={run} />);

    press({ code: 'KeyZ', ctrlKey: true, altKey: true });

    expect(run).not.toHaveBeenCalled();
  });

  it('stops listening once it is gone', () => {
    const run = vi.fn();
    render(<Listening run={run} />).unmount();

    press({ code: 'KeyK', ctrlKey: true, altKey: true });

    expect(run).not.toHaveBeenCalled();
  });
});
