import { describe, expect, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { recordingClient } from '../../kroma-client.fixture';

const TORRENTS = { mount: '/api/module/tv.kroma.torrents' };

const DECLARED = {
  mount: '/api/module/tv.kroma.torrents',
  sources: [
    {
      mount: '/api/module/tv.kroma.torrents',
      label: 'Torrents',
      icon: 'magnet',
      figures: [{ key: 'speed', label: 'Vitesse', kind: 'rate' }],
      map: { label: 'Morceaux reçus' },
      actions: [{ key: 'cancel', label: 'Annuler' }],
    },
  ],
};

describe('the capability endpoints', () => {
  it.each<Endpoint>([
    {
      name: 'the listing is one session-gated read',
      call: (c) => c.capabilities.read(),
      method: 'GET',
      path: '/capabilities',
    },
  ])('$name', checkEndpoint);
});

describe('what a server says it can do', () => {
  it('reads each capability with the mount answering it', async () => {
    const { client } = recordingClient(() => ({ json: { capabilities: { watchable: TORRENTS } } }));

    await expect(client.capabilities.read()).resolves.toEqual({ watchable: TORRENTS });
  });

  it('reads a server that answers none as a map with nothing in it', async () => {
    const { client } = recordingClient(() => ({ json: { capabilities: {} } }));

    await expect(client.capabilities.read()).resolves.toEqual({});
  });

  it('reads the sources a capability declares, with what each one reports', async () => {
    const { client } = recordingClient(() => ({ json: { capabilities: { watchable: DECLARED } } }));

    await expect(client.capabilities.read()).resolves.toEqual({ watchable: DECLARED });
  });

  it('reads a capability declaring no source as a mount and nothing else', async () => {
    const { client } = recordingClient(() => ({ json: { capabilities: { watchable: TORRENTS } } }));

    const capabilities = await client.capabilities.read();

    expect(capabilities.watchable?.sources).toBeUndefined();
  });

  it('refuses a source that names no way to reach it', async () => {
    const nameless = { mount: '/m', sources: [{ mount: '', label: 'Torrents' }] };
    const { client } = recordingClient(() => ({ json: { capabilities: { watchable: nameless } } }));

    await expect(client.capabilities.read()).rejects.toThrow();
  });

  it('names a source after its module when the source named itself nothing', async () => {
    const mount = '/api/module/tv.kroma.torrents';
    const unnamed = { mount, sources: [{ mount }] };
    const { client } = recordingClient(() => ({ json: { capabilities: { watchable: unnamed } } }));

    const capabilities = await client.capabilities.read();

    expect(capabilities.watchable?.sources).toEqual([
      { mount, label: 'tv.kroma.torrents', figures: [], actions: [] },
    ]);
  });

  it('drops a figure whose kind it cannot draw and keeps the ones it can', async () => {
    const mixed = {
      mount: '/m',
      sources: [
        {
          mount: '/m',
          label: 'Torrents',
          figures: [
            { key: 'aura', label: 'Aura', kind: 'hologram' },
            { key: 'speed', kind: 'rate' },
          ],
          actions: [{ key: 'cancel' }],
        },
      ],
    };
    const { client } = recordingClient(() => ({ json: { capabilities: { watchable: mixed } } }));

    const capabilities = await client.capabilities.read();

    expect(capabilities.watchable?.sources?.[0]).toEqual({
      mount: '/m',
      label: 'Torrents',
      figures: [{ key: 'speed', label: 'speed', kind: 'rate' }],
      actions: [],
    });
  });

  it('refuses a capability with nothing to build a path under', async () => {
    const { client } = recordingClient(() => ({
      json: { capabilities: { watchable: { mount: '' } } },
    }));

    await expect(client.capabilities.read()).rejects.toThrow();
  });
});
