import { describe, expect, it } from 'vitest';
import { routeParam } from './nav';

describe('routeParam', () => {
  it('keeps a real segment', () => {
    expect(routeParam('abc123')).toBe('abc123');
  });

  it('reads the literals a template writes for an absent value as no value', () => {
    expect(routeParam('undefined')).toBeNull();
    expect(routeParam('null')).toBeNull();
  });

  it('answers null for a missing or empty segment', () => {
    expect(routeParam(undefined)).toBeNull();
    expect(routeParam('')).toBeNull();
  });

  it('takes the first of a repeated segment', () => {
    expect(routeParam(['a', 'b'])).toBe('a');
    expect(routeParam([])).toBeNull();
  });
});
