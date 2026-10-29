// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { liveState, setLive } from '../live';
import { readSession, writeSession } from '../session';
import { Devtools } from './devtools';

function press(code: string): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, ctrlKey: true, altKey: true }));
  });
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  setLive({ keys: false, outline: 'off', locale: null });
});

describe('the dev tools', () => {
  it('resets page inspection and language overrides while keeping the panel and editor preference', () => {
    writeSession({ open: true, editor: 'code' });
    setLive({ keys: true, outline: 'all', locale: 'fr' });
    render(<Devtools host={document.createElement('div')} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(liveState()).toEqual({ keys: false, outline: 'off', locale: null });
    expect(readSession()).toMatchObject({ open: true, editor: 'code' });
  });

  it('keeps the corner a drag stored, which it does not own, when the panel opens', () => {
    render(<Devtools host={document.createElement('div')} />);
    writeSession({ x: 40, y: 60 });

    press('KeyI');

    expect(readSession()).toMatchObject({ open: true, x: 40, y: 60 });
  });

  it('throws a switch on the page rather than into what a reload restores', () => {
    render(<Devtools host={document.createElement('div')} />);

    press('KeyK');

    expect([liveState().keys, readSession()]).toEqual([
      true,
      { open: false, editor: null, x: null, y: null },
    ]);
  });
});
