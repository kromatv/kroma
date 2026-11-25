import { describe, expect, it } from 'vitest';
import { summarizeState } from './state-summary';

const read = (values: object, name = 'Select.Root') => summarizeState(name, {}, values);

describe('a state summary', () => {
  it('reads a list of primitives and a record of primitives in full', () => {
    const state = read({ value: ['fr', 'en'], crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 } });

    expect(state).toEqual({
      value: ['fr', 'en'],
      crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
    });
  });

  it('reads a list of records in full and what lies deeper as its tag', () => {
    const state = read({ rows: [{ id: 1, tags: ['a', 'b'], at: { x: 1 } }] });

    expect(state).toEqual({ rows: [{ id: 1, tags: '[array 2]', at: '[object]' }] });
  });

  it('keeps reading a function, an element, a date and a map as their tags', () => {
    const state = read({ list: [() => null, new Date(0), new Map(), Number.NaN, undefined] });

    expect(state).toEqual({ list: ['[function]', '[object]', '[object]', 'NaN', null] });
  });

  it('cuts a long list and says how many entries it left out', () => {
    const state = read({ sizes: Array.from({ length: 30 }, (_, i) => i) });

    expect(state.sizes).toHaveLength(25);
    expect(state.sizes).toContain('…+6');
  });

  it('cuts a long record and a long string inside a list', () => {
    const wide = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i]));

    const state = read({ wide, words: ['x'.repeat(500)] });

    expect(Object.keys(state.wide ?? {})).toHaveLength(25);
    expect(state.wide).toMatchObject({ '…': '+6' });
    expect(state.words).toEqual([`${'x'.repeat(120)}…`]);
  });

  it('never reports a list or a record typed into a field that hides it', () => {
    const state = read({ value: ['4', '8'], defaultValue: { digits: '0000' } }, 'PinField');

    expect(state).toEqual({ value: '[secret]', defaultValue: '[secret]' });
  });
});
