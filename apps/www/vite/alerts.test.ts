import { describe, expect, it } from 'vitest';
import { remarkAlerts } from './alerts';

interface TestNode {
  type: string;
  value?: string;
  children?: TestNode[];
  data?: { hName?: string; hProperties?: { className?: string[] } };
}

const text = (value: string): TestNode => ({ type: 'text', value });
const paragraph = (...children: TestNode[]): TestNode => ({ type: 'paragraph', children });
const quote = (...children: TestNode[]): TestNode => ({ type: 'blockquote', children });

function run(node: TestNode, path = '/repo/docs/setup/docker.md'): TestNode {
  const tree: TestNode = { type: 'root', children: [node] };
  remarkAlerts()(tree, { path });
  return tree.children?.[0] as TestNode;
}

const plain = (node: TestNode | undefined): string =>
  node?.value ?? (node?.children ?? []).map(plain).join('');

describe('remarkAlerts', () => {
  it('turns a marked quote into a callout of its kind', () => {
    const node = run(quote(paragraph(text('[!WARNING]\nThis deletes your data.'))));

    expect(node.data?.hName).toBe('aside');
    expect(node.data?.hProperties?.className).toEqual(['callout', 'callout-warning']);
    expect(plain(node.children?.[0])).toBe('Warning');
    expect(plain(node.children?.[1])).toBe('This deletes your data.');
  });

  it('titles the callout in the language of the file', () => {
    const node = run(
      quote(paragraph(text('[!NOTE]\nUne remarque.'))),
      '/repo/apps/www/content/docs/docker.fr.md',
    );

    expect(plain(node.children?.[0])).toBe('Remarque');
  });

  it('drops a marker that stands alone in its paragraph', () => {
    const node = run(quote(paragraph(text('[!TIP]')), paragraph(text('The tip itself.'))));

    expect(node.children?.map(plain)).toEqual(['Tip', 'The tip itself.']);
  });

  it('drops the line break after the marker', () => {
    const node = run(quote(paragraph(text('[!CAUTION]'), { type: 'break' }, text('Careful.'))));

    expect(node.children?.map(plain)).toEqual(['Caution', 'Careful.']);
  });

  it('reads the marker in any case', () => {
    const node = run(quote(paragraph(text('[!important] Read this.'))));

    expect(node.data?.hProperties?.className).toEqual(['callout', 'callout-important']);
  });

  it('leaves an ordinary quote as a quote', () => {
    const node = run(quote(paragraph(text('Someone said this.'))));

    expect(node.data).toBeUndefined();
    expect(plain(node)).toBe('Someone said this.');
  });

  it('finds a callout nested in a list', () => {
    const list: TestNode = {
      type: 'list',
      children: [{ type: 'listItem', children: [quote(paragraph(text('[!NOTE]\nNested.')))] }],
    };

    const node = run(list);

    expect(node.children?.[0]?.children?.[0]?.data?.hName).toBe('aside');
  });
});
