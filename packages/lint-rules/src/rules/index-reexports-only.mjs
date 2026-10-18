import { defineRule } from '../define-rule.mjs';

export default defineRule(
  'index-reexports-only',
  {
    description: 'Keep index.ts and index.tsx files as direct re-export barrels.',
    why: 'CONVENTIONS.md says an index.ts re-exports and nothing else. Runtime logic in a barrel obscures ownership and can introduce initialization side effects.',
    scope:
      'Every top-level statement in files named exactly index.ts or index.tsx. Direct named, namespace, and star re-exports with a source are allowed, including type-only exports.',
    repair:
      'Move declarations, local imports, and executable statements into a descriptively named sibling module. Re-export the public contract directly from that module with export { Name } from or export type { Name } from. Preserve import ordering where initialization side effects previously mattered.',
    exceptions:
      'Comments and empty statements are allowed. Other filenames and generated files excluded by the root config are not checked. Side-effect imports and local export declarations are deliberately rejected. No automatic fix because choosing a module boundary requires judgment.',
    verification:
      'Run bun run lint, the owning workspace typecheck, and import/mount tests for consumers. Source: CONVENTIONS.md, A file name says what it exports, and a suffix says how it resolves.',
    invalid: ['export const retryLimit = 3;', "import './install';"],
    valid: [
      "export { retryLimit } from './retry-limit';",
      "export type { Session } from './session';",
    ],
  },
  {
    meta: {
      messages: {
        violation:
          'Barrels must directly re-export public symbols. Move this statement into a named module and re-export from it; preserve any initialization behavior. Run bun run lint:rules index-reexports-only for the repair guide.',
      },
    },
    create(context) {
      if (!/(?:^|[/])index\.tsx?$/.test(context.filename)) return {};
      return {
        Program(node) {
          for (const statement of node.body) {
            if (statement.type === 'EmptyStatement') continue;
            if (
              ['ExportNamedDeclaration', 'ExportAllDeclaration'].includes(statement.type) &&
              statement.source
            )
              continue;
            context.report({ node: statement, messageId: 'violation' });
          }
        },
      };
    },
  },
);
