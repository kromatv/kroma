import { ImportLibrary } from '@kromatv/client/importers';
import { expect, it } from 'vitest';
import { answered, foldersOf, keptFolders, placed, placesOf } from './import-folders';

const library = (id: string, folders: string[]) =>
  ImportLibrary.parse({ id, name: id, kind: 'movies', folders });

const FILMS = library('films', ['/data/films', '/data/more']);
const SHOWS = library('shows', ['/data/shows', '/data/more']);

it('lists each folder of the libraries once, in the order met', () => {
  expect(foldersOf([FILMS, SHOWS])).toEqual(['/data/films', '/data/more', '/data/shows']);
});

it('keeps one answer for a folder, the last one the owner gave', () => {
  const first = answered([], { folder: '/data/films', here: '/mnt/a' });

  const second = answered(first, { folder: '/data/films', here: '/mnt/b' });

  expect(second).toEqual([{ folder: '/data/films', here: '/mnt/b' }]);
});

it('places a folder where the owner said, ahead of where the server found it', () => {
  const found = [{ folder: '/data/films', here: '/data/films' }, { folder: '/data/shows' }];

  const places = placed(found, [{ folder: '/data/films', here: '/volume1/films' }]);

  expect(places).toEqual([
    { folder: '/data/films', here: '/volume1/films' },
    { folder: '/data/shows', here: undefined },
  ]);
});

it('keeps for a library only its folders that have a place here', () => {
  const places = [{ folder: '/data/films', here: '/volume1/films' }, { folder: '/data/more' }];

  expect(keptFolders(FILMS, places)).toEqual([{ folder: '/data/films', here: '/volume1/films' }]);
  expect(keptFolders(SHOWS, places)).toEqual([]);
});

it('shows the places of the folders the kept libraries hold, and no other', () => {
  const places = [{ folder: '/data/films' }, { folder: '/data/more' }, { folder: '/data/shows' }];

  expect(placesOf([FILMS], places)).toEqual([{ folder: '/data/films' }, { folder: '/data/more' }]);
});
