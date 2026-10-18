import { defineRule } from '../define-rule.mjs';

function within(inner, outer) {
  const [start, end] = inner.range ?? [inner.start, inner.end];
  const [from, to] = outer.range ?? [outer.start, outer.end];
  return start >= from && end <= to;
}

function variableNamed(scope, name) {
  for (let at = scope; at; at = at.upper) {
    const found = at.set.get(name);
    if (found) return found;
  }
  return null;
}

export default defineRule(
  're-export-from',
  {
    description:
      'Re-export a binding with export…from when the file imports it only to export it again.',
    why: 'SonarCloud raises S7763 on this pattern and fails the quality gate on new code. An import that exists only to be exported again is an extra hop a reader has to follow.',
    scope:
      'export { … } and export type { … } without a source, for each specifier whose local name is an imported binding referenced nowhere else in the file. Bindings the file also uses, in code or in types, are allowed, as are export…from and export default.',
    repair:
      "Delete the name from the import and the export list, and write export { name } from 'source' (or export type { name } from 'source') instead. When the import then has no specifiers left, delete it.",
    exceptions:
      'A binding used anywhere else in the file stays imported and exported by name, because the import is needed either way. Default exports are outside this check.',
    verification:
      'Run bun run lint, then the workspace typecheck: the exported names and their kinds must not change. Mirrors Sonar rule S7763 (unicorn prefer-export-from with ignoreUsedVariables).',
    invalid: [
      "import { clamp } from './math'; export { clamp };",
      "import { Box, type BoxProps } from './box'; export type { BoxProps }; export const Card = Box;",
    ],
    valid: [
      "export { clamp } from './math';",
      "import { clamp } from './math'; export const unit = clamp(2); export { clamp };",
      "import type { Theme } from './theme'; export function paint(theme: Theme) { return theme; } export type { Theme };",
    ],
  },
  {
    meta: {
      type: 'suggestion',
      messages: {
        reExport:
          'Use export…from to re-export `{{name}}`: the file imports it only to export it again (Sonar S7763). Run bun run --cwd packages/lint-rules rules re-export-from for the repair.',
      },
    },
    create(context) {
      return {
        ExportNamedDeclaration(node) {
          if (node.source || node.declaration) return;
          const scope = context.sourceCode.getScope(node);
          for (const specifier of node.specifiers) {
            const name = specifier.local.name ?? specifier.local.value;
            const variable = variableNamed(scope, name);
            if (!variable?.defs.some((definition) => definition.type === 'ImportBinding')) continue;
            const elsewhere = variable.references.some(
              (reference) => !within(reference.identifier, node),
            );
            if (!elsewhere)
              context.report({ node: specifier, messageId: 'reExport', data: { name } });
          }
        },
      };
    },
  },
);
