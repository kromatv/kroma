// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { activeTheme } from '#ui/core';
import { configureRemote } from '#ui/lib/focus-remote';
import { FocusRegion, FocusScope } from '#ui/lib/focus-scope';
import { declared, wearsRing } from '#ui/testing';
import { NumberField } from './number-field';

beforeAll(() => configureRemote());

afterEach(cleanup);

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

describe('NumberField', () => {
  it('rings a focused stepper on its own edge, where the well leaves no room', () => {
    render(
      <FocusScope>
        <FocusRegion>
          <NumberField label="Débit" value={3} onValueChange={() => {}} />
        </FocusRegion>
      </FocusScope>,
    );

    press('ArrowDown');

    const edge = activeTheme().ring.focusEdge;
    const step = screen.getByLabelText('Augmenter');
    expect(declared(step, 'outlineOffset')).toBe(`${edge.outlineOffset}px`);
    expect(declared(step, 'outlineWidth')).toBe(`${edge.outlineWidth}px`);
  });

  it('leaves an unfocused stepper no outline to suppress', () => {
    render(
      <FocusScope>
        <FocusRegion>
          <NumberField label="Débit" value={3} onValueChange={() => {}} />
        </FocusRegion>
      </FocusScope>,
    );

    expect(wearsRing(screen.getByLabelText('Augmenter'))).toBe(false);
  });
});
