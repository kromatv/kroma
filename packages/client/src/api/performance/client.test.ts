import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';

describe('the performance endpoints', () => {
  it.each<Endpoint>([
    {
      name: 'overview',
      call: (c) => c.performance.overview('24h'),
      method: 'GET',
      path: '/admin/performance?window=24h',
    },
    {
      name: 'slow',
      call: (c) => c.performance.slow('1h'),
      method: 'GET',
      path: '/admin/performance/slow?window=1h',
    },
    {
      name: 'one slow request',
      call: (c) => c.performance.slowRequest('1795400000000123'),
      method: 'GET',
      path: '/admin/performance/slow/1795400000000123',
    },
    {
      name: 'plan',
      call: (c) => c.performance.plan('4611686018427387904'),
      method: 'GET',
      path: '/admin/performance/segments/4611686018427387904/plan',
    },
    {
      name: 'export',
      call: (c) => c.performance.export('7d'),
      method: 'GET',
      path: '/admin/performance/export?window=7d',
    },
    {
      name: 'the switch',
      call: (c) => c.performance.setEnabled(false),
      method: 'PUT',
      path: '/admin/performance/enabled',
      body: { enabled: false },
    },
  ])('$name', checkEndpoint);
});
