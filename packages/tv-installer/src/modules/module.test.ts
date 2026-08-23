import { describe, expect, it } from 'vitest';
import { booleanOption, stringOption } from './module';

describe('stringOption', () => {
  it('reads a flag that was given a value', () => {
    expect(stringOption({ profile: 'LUMA' }, 'profile')).toBe('LUMA');
  });

  it('treats a flag left empty as one nobody gave', () => {
    expect(stringOption({ profile: '' }, 'profile')).toBeUndefined();
  });

  it('answers nothing for a flag that was never typed', () => {
    expect(stringOption({}, 'profile')).toBeUndefined();
  });

  it('answers nothing when the flag is a switch rather than a value', () => {
    expect(stringOption({ native: true }, 'native')).toBeUndefined();
  });
});

describe('booleanOption', () => {
  it('reads a switch that was turned on', () => {
    expect(booleanOption({ native: true }, 'native')).toBe(true);
  });

  it('reads a switch that was turned off', () => {
    expect(booleanOption({ native: false }, 'native')).toBe(false);
  });

  it('answers nothing for a switch that was never typed', () => {
    expect(booleanOption({}, 'native')).toBeUndefined();
  });

  it('answers nothing when the flag carries a value rather than a switch', () => {
    expect(booleanOption({ profile: 'LUMA' }, 'profile')).toBeUndefined();
  });
});
