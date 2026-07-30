// A remark plugin that counts the words in a post and injects
// `export const readingMinutes = N` into the compiled module, so the blog can show
// a reading estimate without a second `?raw` import of the source (which the MDX
// plugin claims and returns as a component, not text). Compile-time, so every post
// carries its own number with no runtime work.

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
    tree.children?.unshift({
      type: 'mdxjsEsm',
      value: `export const readingMinutes = ${minutes};`,
      data: {
        estree: {
          type: 'Program',
          sourceType: 'module',
          body: [
            {
              type: 'ExportNamedDeclaration',
              specifiers: [],
              source: null,
              declaration: {
                type: 'VariableDeclaration',
                kind: 'const',
                declarations: [
                  {
                    type: 'VariableDeclarator',
                    id: { type: 'Identifier', name: 'readingMinutes' },
                    init: { type: 'Literal', value: minutes },
                  },
                ],
              },
            },
          ],
        },
      },
      // biome-ignore lint/suspicious/noExplicitAny: mdast node shape from the plugin API.
    } as any);
  };
}
