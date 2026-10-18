// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { activeTheme } from '#ui/core';
import { configureRemote } from '#ui/lib/focus-remote';
import { FocusRegion, FocusScope } from '#ui/lib/focus-scope';
import { declared, wearsRing } from '#ui/testing';
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
    expect(declared(reveal, 'outlineOffset')).toBe(`${edge.outlineOffset}px`);
    expect(declared(reveal, 'outlineWidth')).toBe(`${edge.outlineWidth}px`);
  });

  it('leaves an unfocused reveal button no outline to suppress', () => {
    passwordField();

    expect(wearsRing(screen.getByLabelText('Show password'))).toBe(false);
  });
});

function rules(): CSSStyleRule[] {
  const all: CSSStyleRule[] = [];
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) if (rule instanceof CSSStyleRule) all.push(rule);
  }
  return all;
}

const worn = (el: Element) => [...el.classList].map((c) => `.${c}`);

describe('the ink of a field nobody has filled in', () => {
  it('reads the very property the input declares, not one spelled differently', () => {
    const { container } = render(
      <TextField value="" onValueChange={() => {}} placeholder="Nom" physicalKeyboard />,
    );
    const input = container.querySelector('input') as HTMLInputElement;

    const reads = rules().find((r) => r.selectorText.endsWith('::placeholder'));
    const property = /var\((--[\w-]+)\)/.exec(reads?.style.color ?? '')?.[1] ?? '';
    const classes = new Set(worn(input));
    const declares = rules().filter(
      (r) => classes.has(r.selectorText) && r.style.getPropertyValue(property) !== '',
    );

    expect(property).not.toBe('');
    expect(declares).toHaveLength(1);
  });

  it('is muted rather than faint, because a placeholder is text a reader must read', () => {
    const { container } = render(
      <TextField value="" onValueChange={() => {}} placeholder="Nom" physicalKeyboard />,
    );
    const input = container.querySelector('input') as HTMLInputElement;

    expect(declared(input, '--placeholder-text-color')).toBe('var(--kroma-text-muted)');
  });
});
