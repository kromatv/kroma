import { describe, expect, it } from 'vitest';
import { maskOf, STATE_BIT, STATE_KEYS, SV_STATES, stateSuffix } from './states';

describe('SV_STATES', () => {
  it('is the cascade order, weakest first', () => {
    expect(SV_STATES).toEqual(['hover', 'focus', 'press', 'disabled']);
  });

  it('excludes `active`, which is a variant rather than a state', () => {
    expect(SV_STATES).not.toContain('active');
    expect(STATE_KEYS.has('_active')).toBe(false);
  });

  it('derives its keys and bits from the one list', () => {
    expect([...STATE_KEYS]).toEqual(['_hover', '_focus', '_press', '_disabled']);
    expect(STATE_BIT).toEqual({ hover: 1, focus: 2, press: 4, disabled: 8 });
  });
});

describe('maskOf', () => {
  it('is empty for a recipe that declares nothing', () => {
    expect(maskOf([])).toBe(0);
  });

  it('sets one bit per declared state, however often it is declared', () => {
    expect(maskOf(['hover'])).toBe(STATE_BIT.hover);
    expect(maskOf(['hover', 'hover', 'press'])).toBe(STATE_BIT.hover | STATE_BIT.press);
  });
});

describe('stateSuffix', () => {
  const ALL = maskOf(SV_STATES);

  it('is one fixed-width token per combination', () => {
    expect(stateSuffix({}, ALL)).toBe('----');
    expect(stateSuffix({ hover: true }, ALL)).toBe('h---');
    expect(stateSuffix({ disabled: true }, ALL)).toBe('---d');
    expect(stateSuffix({ hover: true, focus: true, press: true, disabled: true }, ALL)).toBe(
      'hfpd',
    );
  });

  it('ignores a state the recipe does not declare, so both spellings share a key', () => {
    const hoverOnly = maskOf(['hover']);
    expect(stateSuffix({ hover: true, disabled: true }, hoverOnly)).toBe(
      stateSuffix({ hover: true }, hoverOnly),
    );
  });

  it('collapses to a single key for a recipe with no states at all', () => {
    expect(stateSuffix({ hover: true, press: true }, 0)).toBe(stateSuffix({}, 0));
  });

  it('treats a missing state object as no states set', () => {
    expect(stateSuffix(undefined, ALL)).toBe('----');
  });

  it('treats only `true` as set, so an undefined flag is not a separate key', () => {
    expect(stateSuffix({ hover: undefined }, ALL)).toBe(stateSuffix({}, ALL));
    expect(stateSuffix({ hover: false }, ALL)).toBe(stateSuffix({}, ALL));
  });

  it('returns the same string instance for the same bits, so the key never allocates', () => {
    expect(stateSuffix({ hover: true }, ALL)).toBe(stateSuffix({ hover: true }, ALL));
  });
});
