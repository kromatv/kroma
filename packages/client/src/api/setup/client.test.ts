import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';

describe('the setup endpoints', () => {
  it.each<Endpoint>([
    { name: 'state', call: (c) => c.setup.state(), method: 'GET', path: '/admin/setup' },
    {
      name: 'advance',
      call: (c) => c.setup.advance({ step: 'people', start: 'bring' }),
      method: 'PUT',
      path: '/admin/setup',
      body: { step: 'people', start: 'bring' },
    },
    { name: 'end', call: (c) => c.setup.end(), method: 'POST', path: '/admin/setup/end' },
    {
      name: 'confirm',
      call: (c) => c.setup.confirm('privacy'),
      method: 'POST',
      path: '/admin/setup/confirm/privacy',
    },
    {
      name: 'dismiss',
      call: (c) => c.setup.dismiss('people'),
      method: 'POST',
      path: '/admin/setup/dismiss/people',
    },
  ])('$name', checkEndpoint);
});
