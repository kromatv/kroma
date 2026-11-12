/** An MDX ESM node declaring `export const <name> = <value>`, which a remark
 *  plugin unshifts onto the tree to hand the page a value computed at build
 *  time. */
export function exportConst(name: string, value: string | number) {
  return {
    type: 'mdxjsEsm',
    value: `export const ${name} = ${JSON.stringify(value)};`,
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
                  id: { type: 'Identifier', name },
                  init: { type: 'Literal', value },
                },
              ],
            },
          },
        ],
      },
    },
  };
}
