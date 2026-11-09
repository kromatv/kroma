// A remark plugin that injects `export const readingMinutes = N` into the compiled
// post, since a second `?raw` import is impossible: the MDX plugin claims the file
// and returns it as a component, not text.

import { exportConst } from './mdx-export.ts';

interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
}

function countWords(node: MdastNode): number {
  let n = 0;
  if ((node.type === 'text' || node.type === 'code' || node.type === 'inlineCode') && node.value) {
    n += node.value.trim().split(/\s+/).filter(Boolean).length;
  }
  for (const child of node.children ?? []) n += countWords(child);
  return n;
}

export function remarkReadingTime() {
  return (tree: MdastNode) => {
    const minutes = Math.max(1, Math.round(countWords(tree) / 200));
    tree.children?.unshift(exportConst('readingMinutes', minutes));
  };
}
