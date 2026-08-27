// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Devtools } from './devtools';
import { readSession, writeSession } from './session';

function press(code: string): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, ctrlKey: true, altKey: true }));
  });
}

afterEach(() => {
  sessionStorage.clear();
});

describe('the dev tools', () => {
  it('keeps the corner a drag stored, which it does not own, when the panel opens', () => {
    render(<Devtools />);
    writeSession({ x: 40, y: 60 });

    press('KeyI');

    expect(readSession()).toMatchObject({ open: true, x: 40, y: 60 });
  });

  it('remembers the switches it does own', () => {
    render(<Devtools />);

    press('KeyK');

    expect(readSession()).toMatchObject({ keys: true, open: false });
  });
});
