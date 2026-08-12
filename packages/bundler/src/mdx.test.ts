import { describe, expect, it } from 'vitest';
import { compileMdx, kromaMdx } from './mdx.mjs';

describe('the Vite half', () => {
  it('compiles before the React transform, which has no spelling for markdown', () => {
    const plugin = kromaMdx();

    expect(plugin.enforce).toBe('pre');
    expect(typeof plugin.transform).toBe('function');
  });

  it('draws on the same options the television is served through', async () => {
    const plugin = kromaMdx();
    const transform = plugin.transform;
    if (typeof transform !== 'function') throw new Error('kromaMdx() lost its transform hook');

    const out = await transform.call({} as never, '# Anatomy\n', '/kit/list-row.docs.mdx');
    const code = typeof out === 'string' ? out : (out?.code ?? '');

    expect(code).toBe(await compileMdx('# Anatomy\n', '/kit/list-row.docs.mdx'));
  });
});
