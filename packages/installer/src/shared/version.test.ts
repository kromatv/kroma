import { describe, expect, it } from 'vitest';
import { olderThan } from './version';

describe('olderThan', () => {
  it('puts a Node release before the floor by its major, then its minor', () => {
    expect(olderThan('20.10.0', '22.12.0')).toBe(true);
    expect(olderThan('22.11.9', '22.12.0')).toBe(true);
    expect(olderThan('22.12.0', '22.12.0')).toBe(false);
    expect(olderThan('24.0.0', '22.12.0')).toBe(false);
  });

  it('compares the parts as numbers, not as text', () => {
    expect(olderThan('9.0', '10.0')).toBe(true);
    expect(olderThan('5.10', '5.9')).toBe(false);
  });

  it('reads a Tizen version with fewer parts than its floor', () => {
    expect(olderThan('5.5', '6.0')).toBe(true);
    expect(olderThan('6', '6.0')).toBe(false);
    expect(olderThan('3.0', '3')).toBe(false);
  });

  it('takes the v that node --version prints', () => {
    expect(olderThan('v20.10.0', '22.12.0')).toBe(true);
  });
});
