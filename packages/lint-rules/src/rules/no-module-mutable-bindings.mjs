import { defineRule } from '../define-rule.mjs';

export default defineRule(
  'no-module-mutable-bindings',
  {
    description: 'Keep mutable bindings inside the component, hook, or factory that owns them.',
    why: 'Module-level let and var bindings survive remounts and leak state between tests and shells sharing the module graph. CONVENTIONS.md prohibits module-scope mutable state.',
    scope:
      'Direct top-level let/var declarations, including named exports, in configured runtime TypeScript sources. The config excludes tests, declarations, and tooling from this rule.',
    repair:
      'For immutable values use const. For mutable state, move the binding into its owning component, hook, or factory and pass state explicitly. Hoist the owning component if state must survive a screen remount. Do not mechanically change let to const around a mutable container.',
    exceptions:
      'Existing theme-version caches are deliberate policy exceptions and need a narrow suppression with the cache key and invalidation reason. This rule does not inspect const container mutation, nested top-level blocks, or ambient declarations. No automatic fix: ownership is a design choice.',
    verification:
      'Run bun run lint, the owning workspace typecheck, and tests that mount two independent consumers and remount the owner. Source: CONVENTIONS.md, No module-scope mutable state.',
    invalid: ['let activeSession = null;', 'export let selectedId = 0;'],
    valid: [
      'const retryLimit = 3;',
      'export function createSession() { let activeSession = null; return () => activeSession; }',
    ],
  },
  {
    meta: {
      messages: {
        mutable:
          'Module-scope {{kind}} survives remounts and shares state across consumers. Use const for immutable values or move state into its owning component/hook/factory. Run bun run lint:rules no-module-mutable-bindings for the repair guide.',
      },
    },
    create(context) {
      return {
        VariableDeclaration(node) {
          if (node.kind === 'const' || node.declare) return;
          const parent =
            node.parent.type === 'ExportNamedDeclaration' ? node.parent.parent : node.parent;
          if (parent.type !== 'Program') return;
          context.report({ node, messageId: 'mutable', data: { kind: node.kind } });
        },
      };
    },
  },
);
