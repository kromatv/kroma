import { describe, expect, it } from 'vitest';
import { appendNames } from './append.ts';

const CODE =
  "const Root = () => null;\nexport const PageHeader = { Root, Back: tag(Back, 'back') };\n";

const NAMED = [
  { target: 'Root', name: 'PageHeader.Root' },
  { target: 'PageHeader.Back', name: 'PageHeader.Back' },
];

describe('appendNames', () => {
  it('appends the import and one call per name, after the module as written', () => {
    const out = appendNames(CODE, '/kit/page-header.tsx', NAMED);

    expect(out.code.startsWith(CODE)).toBe(true);
    expect(out.code.slice(CODE.length)).toBe(
      "\nimport { nameComponent as __kromaName } from '#ui/lib/component-names';\n" +
        '__kromaName(Root, "PageHeader.Root");\n' +
        '__kromaName(PageHeader.Back, "PageHeader.Back");\n',
    );
  });

  it('maps the module back onto its own source', () => {
    expect(appendNames(CODE, '/kit/page-header.tsx', NAMED).map.sources).toEqual([
      '/kit/page-header.tsx',
    ]);
  });
});
