import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { ImportServerId, ImportSignInId } from '../importers';
import { ModuleId } from '../modules';
import { ImportId } from './ids';

const REQUEST = {
  importer: ModuleId.parse('tv.x.import'),
  signIn: ImportSignInId.parse('s-1'),
  server: { id: ImportServerId.parse('srv'), name: 'Home' },
  selection: {
    libraries: [{ id: 'l1', folders: [{ folder: '/data/films', here: '/volume1/films' }] }],
    users: [{ id: 'u1' }],
  },
};

describe('the import endpoints', () => {
  it.each<Endpoint>([
    {
      name: 'start',
      call: (c) => c.imports.start(REQUEST),
      method: 'POST',
      path: '/admin/imports',
      body: {
        importer: 'tv.x.import',
        signIn: 's-1',
        server: { id: 'srv', name: 'Home' },
        selection: {
          libraries: [{ id: 'l1', folders: [{ folder: '/data/films', here: '/volume1/films' }] }],
          users: [{ id: 'u1' }],
        },
      },
    },
    {
      name: 'folders',
      call: (c) =>
        c.imports.folders({
          importer: REQUEST.importer,
          server: REQUEST.server.id,
          folders: ['/data/films'],
        }),
      method: 'POST',
      path: '/admin/imports/folders',
      body: { importer: 'tv.x.import', server: 'srv', folders: ['/data/films'] },
    },
    { name: 'list', call: (c) => c.imports.list(), method: 'GET', path: '/admin/imports' },
    {
      name: 'get',
      call: (c) => c.imports.get(ImportId.parse('i-9')),
      method: 'GET',
      path: '/admin/imports/i-9',
    },
  ])('$name', checkEndpoint);
});
