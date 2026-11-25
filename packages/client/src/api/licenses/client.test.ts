import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';

describe('the licenses endpoint', () => {
  it.each<Endpoint>([
    { name: 'list', call: (c) => c.licenses.list(), method: 'GET', path: '/licenses' },
  ])('$name', checkEndpoint);
});
