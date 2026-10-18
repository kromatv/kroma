import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineRule } from '../define-rule.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const workspaceFolders = new Set(['packages', 'clients', 'apps', 'modules']);

function workspaceFor(filename) {
  const [folder, name] = relative(root, filename).split(sep);
  if (!workspaceFolders.has(folder) || !name) return;
  const directory = join(root, folder, name);
  const manifest = join(directory, 'package.json');
  if (!existsSync(manifest)) return;
  return { directory, name: JSON.parse(readFileSync(manifest, 'utf8')).name };
}

export default defineRule(
  'no-relative-workspace-imports',
  {
    description: 'Reach another workspace through its package name and public exports.',
    why: 'Relative imports across workspaces hide dependencies from package.json, the workspace graph, and knip. Reaching into src also bypasses the package contract.',
    scope:
      'Static relative imports, re-exports, literal dynamic imports, and unshadowed require() calls between different declared workspaces under packages/, clients/, apps/, and modules/. Type-only imports are included.',
    repair:
      'Find the destination package name in its package.json. Import from that name or an existing exported subpath. If the symbol is private, expose an intentional public export first. Declare the dependency in the importing workspace as workspace:*. Keep relative imports within one workspace.',
    exceptions:
      'Root scripts, paths outside declared workspaces, and same-workspace imports are outside this rule. Nonliteral dynamic imports and TS import-equals are not inspected. No automatic fix: the public export and dependency must be chosen deliberately.',
    verification:
      'Run bun run lint:oxc, the importing workspace typecheck, and its focused tests. Confirm the dependency is declared and the chosen subpath exists in exports. Source: CONVENTIONS.md, A package is reached by name, never by path.',
    invalid: ["import { tvShellConfig } from '../../packages/bundler/src/shell';"],
    valid: ["import { tvShellConfig } from '@kromatv/bundler';"],
  },
  {
    meta: {
      messages: {
        boundary:
          'Relative import "{{source}}" crosses into {{packageName}}, hiding the workspace dependency. Use its package name/public exports and declare workspace:* in the importing package.json. Run bun run lint:rules no-relative-workspace-imports for the repair guide.',
      },
    },
    create(context) {
      const filename = context.filename;
      if (!isAbsolute(filename)) return {};
      const owner = workspaceFor(filename);
      if (!owner) return {};

      function check(source) {
        if (typeof source?.value !== 'string' || !source.value.startsWith('.')) return;
        const target = workspaceFor(resolve(dirname(filename), source.value));
        if (!target || target.directory === owner.directory) return;
        context.report({
          node: source,
          messageId: 'boundary',
          data: { source: source.value, packageName: target.name },
        });
      }

      return {
        ImportDeclaration: (node) => check(node.source),
        ExportNamedDeclaration: (node) => check(node.source),
        ExportAllDeclaration: (node) => check(node.source),
        ImportExpression: (node) => check(node.source),
        CallExpression(node) {
          if (node.callee.type !== 'Identifier' || node.callee.name !== 'require') return;
          let scope = context.sourceCode.getScope(node);
          while (scope) {
            if (scope.set.get('require')?.defs.length) return;
            scope = scope.upper;
          }
          check(node.arguments[0]);
        },
      };
    },
  },
);
