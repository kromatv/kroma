import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { LibraryId } from '../media';

const library = LibraryId.parse('lib1');

describe('the library endpoints', () => {
  it.each<Endpoint>([
    { name: 'list', call: (c) => c.library.list(), method: 'GET', path: '/admin/libraries' },
    {
      name: 'create',
      call: (c) => c.library.create({ name: 'Films', folders: ['/mnt/films'], kind: 'movie' }),
      method: 'POST',
      path: '/admin/libraries',
      body: { name: 'Films', folders: ['/mnt/films'], kind: 'movie' },
    },
    {
      name: 'update',
      call: (c) => c.library.update(library, { name: 'Films' }),
      method: 'PATCH',
      path: '/admin/libraries/lib1',
      body: { name: 'Films' },
    },
    {
      name: 'delete',
      call: (c) => c.library.delete(library),
      method: 'DELETE',
      path: '/admin/libraries/lib1',
    },
    {
      name: 'scan',
      call: (c) => c.library.scan(library),
      method: 'POST',
      path: '/admin/libraries/lib1/scan',
    },
    {
      name: 'browse',
      call: (c) => c.library.browse('/mnt/media'),
      method: 'GET',
      path: '/admin/libraries/browse?path=%2Fmnt%2Fmedia',
    },
    {
      name: 'browse with no path, which answers the roots',
      call: (c) => c.library.browse(),
      method: 'GET',
      path: '/admin/libraries/browse',
    },
  ])('$name', checkEndpoint);
});
