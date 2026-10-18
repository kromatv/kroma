import { defineRule } from '../define-rule.mjs';

export default defineRule(
  'no-react-forward-ref',
  {
    description: 'Use a plain function component with ref as a prop instead of React forwardRef.',
    why: 'CODE_STYLE.md requires ref as a prop. React effect events inside forwardRef wrappers can keep the closure captured at mount in this project, leaving callbacks stale.',
    scope:
      'Named forwardRef imports and re-exports from react, plus forwardRef member access on default or namespace React imports, including aliases and computed string properties.',
    repair:
      'Accept ref in the component props and render a plain function component. Use React.Ref<T> or ComponentPropsWithRef for the ref type. When memoization requires a stable fresh callback, use useStableCallback from #ui/lib/stable-callback. Update callers and verify ref attachment.',
    exceptions:
      'Unrelated functions named forwardRef and shadowed React bindings are allowed. CommonJS and indirect aliases are not inspected. No automatic fix: changing wrapper signatures and props requires typechecking callers.',
    verification:
      'Run bun run lint and the component workspace typecheck, then test ref attachment and callback freshness after a rerender. Source: CODE_STYLE.md, Beyond comments.',
    invalid: [
      "import { forwardRef as wrap } from 'react';",
      "import * as React from 'react'; React.forwardRef(render);",
    ],
    valid: [
      "import type { Ref } from 'react'; export function Input({ ref }: { ref?: Ref<HTMLInputElement> }) { return <input ref={ref} />; }",
    ],
  },
  {
    meta: {
      messages: {
        forwardRef:
          'React forwardRef violates the ref-as-prop contract and can retain stale effect-event closures. Use a plain function component accepting ref in props. Run bun run lint:rules no-react-forward-ref for types and verification.',
      },
    },
    create(context) {
      function report(node) {
        context.report({ node, messageId: 'forwardRef' });
      }
      return {
        ImportDeclaration(node) {
          if (node.source.value !== 'react') return;
          for (const specifier of node.specifiers) {
            if (
              specifier.type === 'ImportSpecifier' &&
              (specifier.imported.name ?? specifier.imported.value) === 'forwardRef'
            )
              report(specifier);
          }
        },
        ExportNamedDeclaration(node) {
          if (node.source?.value !== 'react') return;
          for (const specifier of node.specifiers) {
            if ((specifier.local.name ?? specifier.local.value) === 'forwardRef') report(specifier);
          }
        },
        MemberExpression(node) {
          const property = node.computed ? node.property.value : node.property.name;
          if (property !== 'forwardRef' || node.object.type !== 'Identifier') return;
          let scope = context.sourceCode.getScope(node);
          while (scope) {
            const variable = scope.set.get(node.object.name);
            if (variable) {
              if (
                variable.defs.some(
                  (definition) =>
                    definition.parent?.source?.value === 'react' &&
                    ['ImportDefaultSpecifier', 'ImportNamespaceSpecifier'].includes(
                      definition.node.type,
                    ),
                )
              )
                report(node);
              return;
            }
            scope = scope.upper;
          }
        },
      };
    },
  },
);
