import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import type { RulesUpdate } from './schemas';

const UPDATE: RulesUpdate = {
  defaultAction: 'block',
  rules: [
    { id: 'r1', caller: 'core', purpose: 'metadata', host: null, action: 'direct', note: null },
  ],
};

describe('the network endpoints', () => {
  it.each<Endpoint>([
    {
      name: 'flows unfiltered',
      call: (c) => c.network.flows(),
      method: 'GET',
      path: '/admin/network/flows',
    },
    {
      name: 'flows filtered',
      call: (c) =>
        c.network.flows({
          limit: 200,
          caller: 'tv.kroma.torrents',
          purpose: 'peers',
          verdict: 'blocked',
        }),
      method: 'GET',
      path: '/admin/network/flows?limit=200&caller=tv.kroma.torrents&purpose=peers&verdict=blocked',
    },
    {
      name: 'summary over the default week',
      call: (c) => c.network.summary(),
      method: 'GET',
      path: '/admin/network/summary?days=7',
    },
    {
      name: 'summary over a month',
      call: (c) => c.network.summary(30),
      method: 'GET',
      path: '/admin/network/summary?days=30',
    },
    { name: 'rules', call: (c) => c.network.rules(), method: 'GET', path: '/admin/network/rules' },
    {
      name: 'save rules',
      call: (c) => c.network.saveRules(UPDATE),
      method: 'PUT',
      path: '/admin/network/rules',
      body: UPDATE,
    },
    {
      name: 'listeners',
      call: (c) => c.network.listeners(),
      method: 'GET',
      path: '/admin/network/listeners',
    },
  ])('$name', checkEndpoint);
});
