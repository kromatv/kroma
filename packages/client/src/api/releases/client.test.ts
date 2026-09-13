import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';

describe('the release-notes endpoints', () => {
  it.each<Endpoint>([
    { name: 'list', call: (c) => c.releases.list(), method: 'GET', path: '/releases' },
    {
      name: 'markSeen',
      call: (c) => c.releases.markSeen('0.1.39'),
      method: 'POST',
      path: '/releases/seen',
      body: { version: '0.1.39' },
    },
  ])('$name', checkEndpoint);
});
