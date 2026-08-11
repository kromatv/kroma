import { describe, expect, it } from 'vitest';
import { remarkReadingTime } from './reading-time';

// These tests read the injected node directly rather than compiling MDX: the
// number and the shape of the ESM node it hands to the MDX compiler are the
// whole contract.

interface TestNode {
  type: string;
  value?: string;
  children?: TestNode[];
}

const text = (value: string): TestNode => ({ type: 'text', value });

function run(tree: TestNode): TestNode {
  remarkReadingTime()(tree as never);
  return tree.children?.[0] as TestNode;
}

const minutes = (tree: TestNode) => Number(/= (\d+)/.exec(run(tree).value ?? '')?.[1]);

describe('remarkReadingTime', () => {
  it('rounds 200 words a minute', () => {
    const words = Array.from({ length: 600 }, () => 'mot').join(' ');
    expect(minutes({ type: 'root', children: [text(words)] })).toBe(3);
  });

  it('never reports less than a minute', () => {
    expect(minutes({ type: 'root', children: [text('three short words')] })).toBe(1);
  });

  it('counts code and inline code, which a reader does read', () => {
    const long = Array.from({ length: 400 }, () => 'x').join(' ');
    expect(minutes({ type: 'root', children: [{ type: 'code', value: long }] })).toBe(2);
  });

  it('walks nested children', () => {
    const words = Array.from({ length: 200 }, () => 'mot').join(' ');
    const tree: TestNode = {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'emphasis', children: [text(words)] }] }],
    };
    expect(minutes(tree)).toBe(1);
  });

  it('ignores nodes that carry no text', () => {
    expect(minutes({ type: 'root', children: [{ type: 'thematicBreak' }] })).toBe(1);
  });

  it('injects an ESM node the MDX compiler can serialise', () => {
    const node = run({ type: 'root', children: [text('hello world')] });
    expect(node.type).toBe('mdxjsEsm');
    expect(node.value).toBe('export const readingMinutes = 1;');
  });
});
