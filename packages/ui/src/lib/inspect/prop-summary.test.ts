import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { summarizeProps } from './prop-summary';

describe('a prop summary', () => {
  it('keeps primitives as they are', () => {
    expect(summarizeProps('Card', { label: 'Plex', size: 3, open: true, value: null })).toEqual({
      label: 'Plex',
      size: 3,
      open: true,
      value: null,
    });
  });

  it('reduces functions, elements, arrays and objects to a short tag', () => {
    const summary = summarizeProps('Card', {
      onPress: () => null,
      children: createElement('span'),
      items: [1, 2, 3],
      style: { gap: 4 },
    });

    expect(summary).toEqual({
      onPress: '[function]',
      children: '[element]',
      items: '[array 3]',
      style: '[object]',
    });
  });

  it('cuts a long string and leaves out an undefined prop', () => {
    const summary = summarizeProps('Card', { title: 'x'.repeat(5000), hint: undefined });

    expect(summary.title).toHaveLength(121);
    expect('hint' in summary).toBe(false);
  });

  it('cuts a string before an emoji rather than through it', () => {
    const summary = summarizeProps('Card', { title: `${'x'.repeat(119)}🎬 suite` });

    expect(summary.title).toBe(`${'x'.repeat(119)}…`);
  });

  it('cuts a long prop name', () => {
    const summary = summarizeProps('Card', { ['k'.repeat(300)]: 1 });

    expect(Object.keys(summary)).toEqual([`${'k'.repeat(40)}…`]);
  });

  it('keeps a bounded number of keys and says how many it dropped', () => {
    const props = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`p${i}`, i]));

    const summary = summarizeProps('Card', props);

    expect(Object.keys(summary)).toHaveLength(25);
    expect(summary['…']).toBe('+76');
  });

  it.each([
    ['a password field', 'TextField', { type: 'password' }],
    ['a field the platform masks', 'TextField', { secureTextEntry: true }],
    ['a field a password manager fills', 'TextField', { autoComplete: 'new-password' }],
    ['a one-time code', 'TextField', { autoComplete: 'one-time-code' }],
    ['a masked code field', 'OtpField.Root', { mask: true }],
    ['a PIN field, by its name', 'PinField', {}],
  ])('never reports what was typed into %s', (_what, name, marker) => {
    const summary = summarizeProps(name, { ...marker, value: '4821', defaultValue: '0000' });

    expect(summary.value).toBe('[secret]');
    expect(summary.defaultValue).toBe('[secret]');
  });

  it('keeps the value of a control that hides nothing', () => {
    const summary = summarizeProps('ChoiceList.Root', { value: 'plex', autoComplete: 'off' });

    expect(summary.value).toBe('plex');
  });

  it('survives a round trip through JSON', () => {
    const summary = summarizeProps('Card', { ratio: Number.NaN, big: 10n, key: Symbol('k') });

    expect(JSON.parse(JSON.stringify(summary))).toEqual({
      ratio: 'NaN',
      big: '[bigint]',
      key: '[symbol]',
    });
  });
});
