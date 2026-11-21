import { expect, it } from 'vitest';
import { shortPath } from './short-path';

it('keeps a path of three folders or fewer as it is', () => {
  expect(shortPath('/volume1/video/Films')).toBe('/volume1/video/Films');
});

it('cuts a longer path to its last three folders', () => {
  expect(shortPath('/volume1/video/library/Films/Action')).toBe('…/library/Films/Action');
});

it('reads a Windows path the same way', () => {
  expect(shortPath('D:\\Media\\Library\\Series\\Drama')).toBe('…/Library/Series/Drama');
});
