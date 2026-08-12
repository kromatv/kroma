import { describe, expect, it } from 'vitest';
import { a11yState, a11yValue } from './a11y';

describe('a11yState', () => {
  it('hands React Native the state object it reads', () => {
    const state = { checked: true, selected: false };
    expect(a11yState(state)).toEqual({ accessibilityState: state });
  });

  it('says a toggle button is on the only way its platforms hear it', () => {
    expect(a11yState({ pressed: true })).toEqual({ accessibilityState: { selected: true } });
  });
});

describe('a11yValue', () => {
  it('hands React Native the value object it reads', () => {
    const value = { min: 0, max: 100, now: 30 };
    expect(a11yValue(value)).toEqual({ accessibilityValue: value });
  });
});
