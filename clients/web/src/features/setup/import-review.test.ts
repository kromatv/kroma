import { ImportLibrary, ImportUser } from '@kromatv/client/importers';
import { expect, it } from 'vitest';
import { cautions, importable, keptIds, sight, skippedIds } from './import-review';

const user = (over: Record<string, unknown>) =>
  ImportUser.parse({
    id: 'u1',
    name: 'Alex',
    signedIn: false,
    allLibraries: false,
    libraries: [],
    finerLimits: [],
    stateLocked: false,
    ...over,
  });

const library = (kind: string) =>
  ImportLibrary.parse({ id: 'l1', name: 'Films', kind, folders: ['/media/films'] });

it('takes a library of films, of shows or of both, and no other kind', () => {
  expect(importable(library('movies'))).toBe(true);
  expect(importable(library('mixed'))).toBe(true);
  expect(importable(library('music'))).toBe(false);
});

it('keeps every id the owner did not leave out', () => {
  expect(keptIds(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c']);
  expect(skippedIds(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b']);
});

it('says how much of the other server a user saw', () => {
  expect(sight(user({ allLibraries: true }))).toBe('all');
  expect(sight(user({ libraries: ['l1'] }))).toBe('some');
  expect(sight(user({}))).toBe('none');
});

it('warns about the owner themselves, a finer limit and a locked history', () => {
  expect(cautions(user({}))).toEqual([]);
  expect(cautions(user({ signedIn: true, finerLimits: ['rating'], stateLocked: true }))).toEqual([
    'you',
    'limited',
    'locked',
  ]);
});
