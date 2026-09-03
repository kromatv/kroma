import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { recordingClient } from '../../kroma-client.fixture';
import { ModuleId } from './ids';

const TORRENTS = {
  id: 'tv.kroma.torrents',
  name: 'Téléchargements',
  enabled: true,
  contributes: [
    {
      point: 'acquisition',
      label: 'qBittorrent',
      fields: [{ key: 'url', label: 'URL', type: 'string' }],
    },
  ],
};

describe('the module endpoints', () => {
  it.each<Endpoint>([
    { name: 'list', call: (c) => c.modules.list(), method: 'GET', path: '/modules' },
  ])('$name', checkEndpoint);
});

describe("a module's own admin API", () => {
  const torrents = ModuleId.parse('tv.kroma.torrents');
  const Clients = z.array(z.object({ id: z.string() }));

  it("mounts every verb under the module's encoded id", async () => {
    const { client, calls } = recordingClient(() => ({ json: [] }));
    const api = client.modules.api(torrents);

    await api.get('/clients', Clients);
    await api.post('/clients', { url: 'http://qb' });
    await api.post('/clients', { url: 'http://qb' }, Clients);
    await api.put('/clients/1', { url: 'http://qb' });
    await api.put('/clients/1', { url: 'http://qb' }, Clients);
    await api.delete('/clients/1');
    await api.delete('/clients/1', Clients);
    await api.upload('/torrent', new Blob(['d8']), Clients);

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /admin/m/tv.kroma.torrents/clients',
      'POST /admin/m/tv.kroma.torrents/clients',
      'POST /admin/m/tv.kroma.torrents/clients',
      'PUT /admin/m/tv.kroma.torrents/clients/1',
      'PUT /admin/m/tv.kroma.torrents/clients/1',
      'DELETE /admin/m/tv.kroma.torrents/clients/1',
      'DELETE /admin/m/tv.kroma.torrents/clients/1',
      'POST /admin/m/tv.kroma.torrents/torrent',
    ]);
  });

  it('parses what a module answers with the schema the module passed in', async () => {
    const { client } = recordingClient(() => ({ json: [{ id: 'qb' }] }));
    const api = client.modules.api(torrents);

    await expect(api.get('/clients', Clients)).resolves.toEqual([{ id: 'qb' }]);
    await expect(api.get('/clients', z.array(z.object({ id: z.number() })))).rejects.toThrow();
  });
});

describe('the module list', () => {
  it('reads a module with its contributions and add-form fields', async () => {
    const { client } = recordingClient(() => ({ json: [TORRENTS] }));

    const modules = await client.modules.list();

    expect(modules[0]?.id).toBe('tv.kroma.torrents');
    expect(modules[0]?.contributes?.[0]?.fields?.[0]?.key).toBe('url');
  });

  it('renders a field kind this build does not know as a text field', async () => {
    const odd = {
      ...TORRENTS,
      contributes: [{ point: 'acquisition', fields: [{ key: 'k', label: 'K', type: 'colour' }] }],
    };
    const { client } = recordingClient(() => ({ json: [odd] }));

    const modules = await client.modules.list();

    expect(modules[0]?.contributes?.[0]?.fields?.[0]?.type).toBe('string');
  });

  it('drops a module whose manifest the schema rejects and keeps the rest', async () => {
    const { client } = recordingClient(() => ({ json: [{ id: 42 }, TORRENTS] }));

    const modules = await client.modules.list();

    expect(modules).toHaveLength(1);
    expect(modules[0]?.id).toBe('tv.kroma.torrents');
  });

  it('rejects a body that is not a list at all', async () => {
    const { client } = recordingClient(() => ({ json: { modules: [] } }));

    await expect(client.modules.list()).rejects.toThrow();
  });
});
