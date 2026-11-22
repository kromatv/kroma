import { expect, it } from 'vitest';
import { leftBehindLine } from './import-words';

it('names a thing an import does not bring', () => {
  expect(leftBehindLine('playlists')).toBe('setup.importLeftPlaylists');
});

it('has no line for a thing this client does not know', () => {
  expect(leftBehindLine('holograms')).toBeNull();
});
