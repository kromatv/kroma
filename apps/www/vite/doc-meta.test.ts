import { describe, expect, it } from 'vitest';
import { remarkDocMeta } from './doc-meta';

interface TestNode {
  type: string;
  depth?: number;
  value?: string;
  children?: TestNode[];
}

const text = (value: string): TestNode => ({ type: 'text', value });

function exported(tree: TestNode): Record<string, string> {
  const out: Record<string, string> = {};
  for (const node of tree.children ?? []) {
    const match = /^export const (\w+) = (.*);$/.exec(node.value ?? '');
    if (node.type === 'mdxjsEsm' && match?.[1] && match[2]) out[match[1]] = JSON.parse(match[2]);
  }
  return out;
}

describe('remarkDocMeta', () => {
  it('lifts the title out of the body and exports it with the first paragraph', () => {
    const tree: TestNode = {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 1,
          children: [text('Install '), { type: 'inlineCode', value: 'KROMA' }],
        },
        {
          type: 'paragraph',
          children: [
            text('KROMA runs\n'),
            { type: 'strong', children: [text('anywhere')] },
            text('.'),
          ],
        },
        { type: 'heading', depth: 2, children: [text('Before you begin')] },
      ],
    };

    remarkDocMeta()(tree, { path: '/repo/docs/setup/docker.md' });

    expect(exported(tree)).toEqual({ title: 'Install KROMA', description: 'KROMA runs anywhere.' });
    expect(tree.children?.some((n) => n.type === 'heading' && n.depth === 1)).toBe(false);
    expect(tree.children?.some((n) => n.type === 'heading' && n.depth === 2)).toBe(true);
  });

  it('exports empty strings for a guide with no title and no paragraph', () => {
    const tree: TestNode = { type: 'root', children: [{ type: 'code', value: 'docker ps' }] };

    remarkDocMeta()(tree, { path: '/repo/apps/www/content/docs/tv.fr.md' });

    expect(exported(tree)).toEqual({ title: '', description: '' });
  });

  it('leaves a blog post untouched', () => {
    const tree: TestNode = {
      type: 'root',
      children: [{ type: 'heading', depth: 1, children: [text('A post')] }],
    };

    remarkDocMeta()(tree, { path: '/repo/apps/www/content/blog/post.mdx' });

    expect(tree.children).toHaveLength(1);
  });
});
