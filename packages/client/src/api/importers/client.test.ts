import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { ModuleId } from '../modules';
import { ImportServerId, ImportSignInId } from './ids';

const IMPORTER = ModuleId.parse('tv.x.import');
const SIGN_IN = ImportSignInId.parse('s-1');
const SERVER = ImportServerId.parse('srv');

describe('the importer endpoints', () => {
  it.each<Endpoint>([
    { name: 'list', call: (c) => c.importers.list(), method: 'GET', path: '/admin/importers' },
    {
      name: 'connect',
      call: (c) => c.importers.connect(IMPORTER, { url: 'http://nas:8096', password: 'x' }),
      method: 'POST',
      path: '/admin/importers/tv.x.import/connect',
      body: { fields: { url: 'http://nas:8096', password: 'x' } },
    },
    {
      name: 'resume',
      call: (c) => c.importers.resume(IMPORTER, 'p-7'),
      method: 'POST',
      path: '/admin/importers/tv.x.import/connect',
      body: { pending: 'p-7' },
    },
    {
      name: 'survey',
      call: (c) => c.importers.survey(IMPORTER, SIGN_IN, SERVER),
      method: 'POST',
      path: '/admin/importers/tv.x.import/survey',
      body: { signIn: 's-1', server: 'srv' },
    },
    {
      name: 'forget',
      call: (c) => c.importers.forget(IMPORTER, SIGN_IN),
      method: 'POST',
      path: '/admin/importers/tv.x.import/forget',
      body: { signIn: 's-1' },
    },
  ])('$name', checkEndpoint);
});
