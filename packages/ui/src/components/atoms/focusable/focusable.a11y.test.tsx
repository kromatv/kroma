// @vitest-environment jsdom

// react-native-web does NOT read React Native's `accessibilityState` object:
// it reads flat `aria-*` props. Every control that says what it IS (a switch,
// a radio, a tab, a disclosure) went out with its role and WITHOUT its state
// until <Focusable> emitted the shape the platform actually reads, and nothing
// but a DOM assertion catches that - the props all look right in the tree.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Checkbox } from '#ui/components/atoms/checkbox';
import { Radio } from '#ui/components/atoms/radio';
import { Switch } from '#ui/components/atoms/switch';
import { Focusable } from './focusable';

afterEach(cleanup);

describe('accessibility state reaches the DOM', () => {
  it('gives a switch its role and its checked state', () => {
    render(<Switch label="Suivre" checked />);
    const el = screen.getByLabelText('Suivre');
    expect(el.getAttribute('role')).toBe('switch');
    expect(el.getAttribute('aria-checked')).toBe('true');
  });

  it('gives a checkbox `mixed` when it is indeterminate', () => {
    render(<Checkbox label="Tout" checked={false} indeterminate />);
    expect(screen.getByLabelText('Tout').getAttribute('aria-checked')).toBe('mixed');
  });

  it('gives a radio its checked state', () => {
    render(<Radio label="Auto" checked />);
    const el = screen.getByLabelText('Auto');
    expect(el.getAttribute('role')).toBe('radio');
    expect(el.getAttribute('aria-checked')).toBe('true');
  });

  it('carries selected and expanded too', () => {
    render(
      <>
        <Focusable label="Onglet" role="tab" selected />
        <Focusable label="Avance" expanded={false} />
      </>,
    );
    expect(screen.getByLabelText('Onglet').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('Avance').getAttribute('aria-expanded')).toBe('false');
  });

  it('says nothing about a control that claims no state', () => {
    render(<Focusable label="Lecture" />);
    const el = screen.getByLabelText('Lecture');
    expect(el.getAttribute('aria-checked')).toBeNull();
    expect(el.getAttribute('aria-selected')).toBeNull();
    expect(el.getAttribute('aria-expanded')).toBeNull();
  });
});
