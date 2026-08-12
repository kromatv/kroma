import { describe, expect, it } from 'vitest';
import { a11yState, a11yValue } from './a11y';

describe('a11yState', () => {
  it('writes the flat aria props react-native-web reads', () => {
    expect(
      a11yState({ checked: 'mixed', selected: true, expanded: false, busy: true, disabled: true }),
    ).toEqual({
      'aria-busy': true,
      'aria-checked': 'mixed',
      'aria-disabled': true,
      'aria-expanded': false,
      'aria-pressed': undefined,
      'aria-selected': true,
    });
  });

  it('keeps a toggle button pressed rather than selected', () => {
    const state = a11yState({ pressed: true });
    expect(state['aria-pressed']).toBe(true);
    expect(state['aria-selected']).toBeUndefined();
  });

  it('never writes the accessibilityState object, which the browser drops', () => {
    expect(a11yState({ busy: true })).not.toHaveProperty('accessibilityState');
  });
});

describe('a11yValue', () => {
  it('writes the flat aria props react-native-web reads', () => {
    expect(a11yValue({ min: 0, max: 120, now: 42, text: '0:42' })).toEqual({
      'aria-valuemax': 120,
      'aria-valuemin': 0,
      'aria-valuenow': 42,
      'aria-valuetext': '0:42',
    });
  });

  it('never writes the accessibilityValue object, which the browser drops', () => {
    expect(a11yValue({ now: 1 })).not.toHaveProperty('accessibilityValue');
  });
});
