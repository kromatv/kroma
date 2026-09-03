import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';

const SAVE = { enabled: true, defaultIndex: 0, providers: [] };

describe('the LLM endpoints', () => {
  it.each<Endpoint>([
    { name: 'config', call: (c) => c.llm.config(), method: 'GET', path: '/admin/llm' },
    {
      name: 'save',
      call: (c) => c.llm.save(SAVE),
      method: 'PUT',
      path: '/admin/llm',
      body: SAVE,
    },
    {
      name: 'models',
      call: (c) => c.llm.models({ provider: 'openai' }),
      method: 'POST',
      path: '/admin/llm/models',
      body: { provider: 'openai' },
    },
    {
      name: 'test',
      call: (c) => c.llm.test({ model: 'gpt' }),
      method: 'POST',
      path: '/admin/llm/test',
      body: { model: 'gpt' },
    },
  ])('$name', checkEndpoint);
});
