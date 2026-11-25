// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activeTheme } from '#ui/core';

import type { ChangeDetails } from '#ui/lib/control';
import { FocusRegion, FocusScope } from '#ui/lib/focus-scope.component';
import { act as call, screenText, snapshot } from '#ui/lib/inspect';
import { I18nProvider } from '#ui/services/i18n';
import { declared, onScreen, wearsRing } from '#ui/testing';
import { TextField } from './text-field.component';

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

    const edge = activeTheme().ring.focusInside;
    const reveal = screen.getByLabelText('Show password');
    expect(declared(reveal, 'outlineOffset')).toBe(`${edge.outlineOffset}px`);
    expect(declared(reveal, 'outlineWidth')).toBe(`${edge.outlineWidth}px`);
  });

  it('leaves an unfocused reveal button no outline to suppress', () => {
    passwordField();

    expect(wearsRing(screen.getByLabelText('Show password'))).toBe(false);
  });

  it('names its reveal button in the language on screen', () => {
    render(
      <I18nProvider locale="fr">
        <TextField label="Mot de passe" type="password" value="hunter2" onValueChange={() => {}} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByLabelText('Afficher le mot de passe'));

    expect(screen.getByLabelText('Masquer le mot de passe')).toBeTruthy();
  });
});

function rules(): CSSStyleRule[] {
  const all: CSSStyleRule[] = [];
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (rule instanceof CSSStyleRule) {
        all.push(rule);
      }
    }
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

const entry = () => screen.getByLabelText<HTMLInputElement>('Nom');

const type = (text: string) => fireEvent.change(entry(), { target: { value: text } });

const refuse = (_next: string, details: ChangeDetails) => details.cancel();

const read = () => snapshot().map(({ kind, state, actions }) => ({ kind, state, actions }));

describe('the value of a field', () => {
  it('takes what is typed when nobody owns it', () => {
    render(<TextField label="Nom" defaultValue="Salon" physicalKeyboard />);

    type('Cuisine');

    expect(entry().value).toBe('Cuisine');
  });

  it('asks the owner and waits for the prop when it is controlled', () => {
    const onValueChange = vi.fn();
    render(<TextField label="Nom" value="Salon" onValueChange={onValueChange} physicalKeyboard />);

    type('Cuisine');

    expect(onValueChange).toHaveBeenCalledWith(
      'Cuisine',
      expect.objectContaining({ reason: 'set', source: 'user' }),
    );
    expect(entry().value).toBe('Salon');
  });

  it('keeps what it held when the app cancels the change', () => {
    render(<TextField label="Nom" defaultValue="Salon" onValueChange={refuse} physicalKeyboard />);

    type('Cuisine');

    expect(entry().value).toBe('Salon');
  });
});

describe('a field under a developer tool', () => {
  it('is read with its value and its setter', () => {
    render(onScreen(<TextField label="Nom" defaultValue="Salon" />));

    expect(read()).toEqual([
      { kind: 'text-field', state: { value: 'Salon' }, actions: ['setValue'] },
    ]);
  });

  it('takes the value a call sets', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
    render(onScreen(<TextField label="Nom" physicalKeyboard />));

    const report = await call({ steps: [{ ref: 'c1', action: 'setValue', args: ['Cuisine'] }] });

    expect(report.ok).toBe(true);
    expect(entry().value).toBe('Cuisine');
  });

  it('refuses a call while it is read-only', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
    render(onScreen(<TextField label="Nom" defaultValue="Salon" readOnly physicalKeyboard />));

    const report = await call({ steps: [{ ref: 'c1', action: 'setValue', args: ['Cuisine'] }] });

    expect(report.error?.message).toBe('c1.setValue: the text-field is disabled.');
    expect(entry().value).toBe('Salon');
  });

  it('never reads out a password', () => {
    render(onScreen(<TextField label="Mot de passe" type="password" defaultValue="hunter2" />));

    expect(read()[0]?.state).toEqual({ value: '[secret]' });
    expect(screenText()).not.toContain('hunter2');
  });
});
