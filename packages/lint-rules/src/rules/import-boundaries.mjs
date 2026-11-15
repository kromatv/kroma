import { posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineRule } from '../define-rule.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));

function inside(path, folder) {
  return path.startsWith(`${folder}/`);
}

function targetOf(file, source, aliases) {
  if (source.startsWith('.')) {
    return posix.normalize(posix.join(posix.dirname(file), source));
  }
  const alias = Object.keys(aliases).find((prefix) => source.startsWith(prefix));
  return alias ? posix.normalize(aliases[alias] + source.slice(alias.length)) : null;
}

function sliceOf(path, roots) {
  const folder = roots.find((candidate) => inside(path, candidate));
  if (!folder) {
    return null;
  }
  const [name] = path.slice(folder.length + 1).split('/');
  return { folder, name };
}

function rungOf(path, ladders) {
  for (const ladder of ladders) {
    const height = ladder.findIndex((folder) => inside(path, folder));
    if (height !== -1) {
      return { ladder, height };
    }
  }
  return null;
}

function siblingOf(file, target, slices) {
  const from = sliceOf(file, slices);
  const to = sliceOf(target, slices);
  const crosses = from && to && from.folder === to.folder && from.name !== to.name;
  return crosses ? { from: from.name, to: to.name } : null;
}

function climbOf(file, target, ladders) {
  const from = rungOf(file, ladders);
  const to = rungOf(target, ladders);
  const climbs = from && to && from.ladder === to.ladder && to.height > from.height;
  return climbs ? { from: from.ladder[from.height], to: to.ladder[to.height] } : null;
}

export default defineRule(
  'import-boundaries',
  {
    description:
      'A slice does not import its sibling, and a layer does not import the one above it.',
    why: 'ARCHITECTURE.md orders the code: features over shared, and the kit as tokens, atoms, molecules, organisms, templates. Each level can be read without the ones above it, and a feature can be changed or removed without opening another. One import the wrong way and that stops being true, with nothing to say so until the cycle shows up.',
    scope:
      'Static imports, re-exports and literal dynamic imports, type-only ones included, written as a relative path or through one of the configured aliases. A slice root (features/) isolates its direct children from each other. A ladder lists folders from lowest to highest, and a file may import its own rung and the rungs below.',
    repair:
      'For a sibling import, lift what both features need into shared/ (or a package when a second workspace needs it) and import it from there. For an upward import, move the imported code down to the rung of its lowest user, or pass it in from above as a prop, a parameter or a render function.',
    exceptions:
      'An import through a package name is the business of no-restricted-imports and the workspace graph, and is not inspected here. Folders that are on no ladder and under no slice root are free. No automatic fix: where the code moves is a design choice.',
    verification:
      'Run bun run lint, the workspace typecheck and its tests. Source: ARCHITECTURE.md and packages/ui/src/components/README.md.',
    invalid: [
      "// clients/web/src/features/catalog/row.tsx\nimport { Player } from '../playback/player';",
      "// packages/ui/src/components/atoms/button/button.tsx\nimport { ListRow } from '#ui/components/molecules/list-row';",
    ],
    valid: [
      "// clients/web/src/features/catalog/row.tsx\nimport { api } from '#web/shared/lib/api';",
      "// packages/ui/src/components/molecules/list-row/list-row.tsx\nimport { Button } from '../../atoms/button';",
    ],
  },
  {
    meta: {
      schema: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            aliases: { type: 'object', additionalProperties: { type: 'string' } },
            slices: { type: 'array', items: { type: 'string' } },
            ladders: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
          },
        },
      ],
      messages: {
        sibling:
          '"{{from}}" imports its sibling "{{to}}". Slices do not know each other: lift the shared code to shared/ or to a package. Run bun run --cwd packages/lint-rules rules import-boundaries for the repair guide.',
        upward:
          '{{from}} imports {{to}}, which sits above it. Move the code down or pass it in from above. Run bun run --cwd packages/lint-rules rules import-boundaries for the repair guide.',
      },
    },
    create(context) {
      const { aliases = {}, slices = [], ladders = [] } = context.options[0] ?? {};
      const file = relative(root, context.filename).split(sep).join('/');

      function check(source) {
        const target =
          typeof source?.value === 'string' ? targetOf(file, source.value, aliases) : null;
        if (!target) {
          return;
        }
        const sibling = siblingOf(file, target, slices);
        const climb = sibling ? null : climbOf(file, target, ladders);
        if (sibling) {
          context.report({ node: source, messageId: 'sibling', data: sibling });
        }
        if (climb) {
          context.report({ node: source, messageId: 'upward', data: climb });
        }
      }
      return {
        ImportDeclaration: (node) => check(node.source),
        ExportNamedDeclaration: (node) => check(node.source),
        ExportAllDeclaration: (node) => check(node.source),
        ImportExpression: (node) => check(node.source),
      };
    },
  },
);
