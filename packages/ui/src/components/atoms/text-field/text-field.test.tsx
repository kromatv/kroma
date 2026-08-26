// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { activeTheme } from '#ui/core';
import { configureRemote } from '#ui/lib/focus-remote';
import { FocusRegion, FocusScope } from '#ui/lib/focus-scope';
import { TextField } from './text-field';

beforeAll(() => configureRemote());

afterEach(cleanup);

function passwordField() {
  return render(
    <FocusScope>
      <FocusRegion>
        <TextField label="Mot de passe" type="password" value="hunter2" onValueChange={() => {}} />
      </FocusRegion>
    </FocusScope>,
  );
}

describe('TextField', () => {
  it('rings a focused reveal button on its own edge, inside the well', () => {
    passwordField();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    const edge = activeTheme().ring.focusEdge;
    const reveal = screen.getByLabelText('Show password');
    expect(reveal.style.outlineOffset).toBe(`${edge.outlineOffset}px`);
    expect(reveal.style.outlineWidth).toBe(`${edge.outlineWidth}px`);
  });

  it('leaves an unfocused reveal button no outline to suppress', () => {
    passwordField();

    expect(screen.getByLabelText('Show password').style.outlineStyle).toBe('');
  });
});
