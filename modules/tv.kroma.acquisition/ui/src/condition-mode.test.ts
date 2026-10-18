import { describe, expect, it } from 'vitest';
import { modeOf, withMode } from './condition-mode';
import type { Condition } from './rules-schemas';

function condition(over: Partial<Condition> = {}): Condition {
  return {
    negate: false,
    required: false,
    type: 'resolution',
    value: 'R1080',
    ...over,
  } as Condition;
}

describe('modeOf', () => {
  it('reads a condition nothing marks as one of several that may hold', () => {
    expect(modeOf(condition())).toBe('optional');
  });

  it('reads a required condition as one that has to hold', () => {
    expect(modeOf(condition({ required: true }))).toBe('required');
  });

  it('reads a negated condition as excluded, whether or not it is required', () => {
    expect(modeOf(condition({ negate: true }))).toBe('excluded');
    expect(modeOf(condition({ negate: true, required: true }))).toBe('excluded');
  });
});

describe('withMode', () => {
  it('writes an exclusion as a hard rule, so one press cannot leave it optional', () => {
    const excluded = withMode(condition(), 'excluded');

    expect(excluded).toMatchObject({ negate: true, required: true });
  });

  it('clears the negation when a condition goes back to holding', () => {
    const back = withMode(withMode(condition(), 'excluded'), 'optional');

    expect(back).toMatchObject({ negate: false, required: false });
  });

  it('keeps what the condition tests', () => {
    expect(withMode(condition(), 'required')).toMatchObject({
      type: 'resolution',
      value: 'R1080',
    });
  });
});
