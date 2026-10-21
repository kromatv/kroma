import { describe, expect, it } from 'vitest';
import { conditional } from './conditional';

describe('conditional', () => {
  it('splits a name, its true branch and its false branch', () => {
    expect(conditional('flag ? <A /> : null')).toEqual({
      name: 'flag',
      whenTrue: ' <A /> ',
      whenFalse: ' null',
    });
  });

  it('is not a conditional without a question mark', () => {
    expect(conditional('flag')).toBeNull();
  });

  it('is not a conditional when the test is not a bare name', () => {
    expect(conditional('a.b ? 1 : 2')).toBeNull();
  });

  it('is not a conditional when the colon never comes', () => {
    expect(conditional('flag ? 1')).toBeNull();
  });

  it('skips a colon inside a string, an escape or a bracket', () => {
    expect(conditional(`flag ? "a:\\"b" : {x: 1}`)?.whenFalse).toBe(' {x: 1}');
    expect(conditional('flag ? f(a ? 1 : 2) : 3')?.whenFalse).toBe(' 3');
  });

  it('skips the colon of a nested conditional', () => {
    expect(conditional('flag ? a ? 1 : 2 : 3')?.whenFalse).toBe(' 3');
  });
});
