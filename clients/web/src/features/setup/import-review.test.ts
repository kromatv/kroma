import {
  ImportLibrary,
  ImportServerId,
  ImportSignInId,
  ImportSurvey,
  ImportUser,
} from '@kromatv/client/importers';
import { ModuleId } from '@kromatv/client/modules';
import { expect, it } from 'vitest';
import { cautions, importable, importRequest, keptIds, sight, skippedIds } from './import-review';

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

const target = {
  importer: ModuleId.parse('tv.x.import'),
  signIn: ImportSignInId.parse('s-1'),
  server: ImportServerId.parse('srv'),
};

const survey = ImportSurvey.parse({
  libraries: [
    { id: 'films', name: 'Films', kind: 'movies', folders: ['/m/films'] },
    { id: 'music', name: 'Music', kind: 'music', folders: ['/m/music'] },
    { id: 'shows', name: 'Shows', kind: 'shows', folders: ['/m/shows'] },
  ],
  users: [
    {
      id: 'u1',
      name: 'Alex',
      signedIn: true,
      allLibraries: true,
      libraries: [],
      finerLimits: [],
      stateLocked: false,
    },
    {
      id: 'u2',
      name: 'Sam',
      signedIn: false,
      allLibraries: false,
      libraries: ['films'],
      finerLimits: [],
      stateLocked: false,
    },
  ],
  counts: {},
  leftBehind: [],
});

it('asks for the libraries and the users the owner kept, and never for a kind it cannot take', () => {
  const choices = {
    servers: [{ id: target.server, name: 'Home' }],
    skippedLibraries: ['shows'],
    skippedUsers: ['u2'],
  };

  const request = importRequest(target, choices, survey);

  expect(request.server).toEqual({ id: 'srv', name: 'Home' });
  expect(request.selection).toEqual({ libraries: [{ id: 'films' }], users: [{ id: 'u1' }] });
});

it('asks for everything KROMA can take when the owner left nothing out', () => {
  const choices = { servers: [], skippedLibraries: [], skippedUsers: [] };

  const request = importRequest(target, choices, survey);

  expect(request.selection.libraries).toEqual([{ id: 'films' }, { id: 'shows' }]);
  expect(request.selection.users).toEqual([{ id: 'u1' }, { id: 'u2' }]);
});
