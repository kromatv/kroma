import { defineRule } from '../define-rule.mjs';

export default defineRule(
  'no-nested-templates',
  {
    description: 'Lift nested template literals into named bindings.',
    why: 'CONVENTIONS.md explicitly prohibits nested template literals (TS S4624). Nesting makes interpolation boundaries hard to read and conceals independently meaningful values.',
    scope:
      'An untagged template literal occurring inside an interpolation of another untagged template literal, through any intermediate expression. Function bodies are independent evaluation scopes. Tagged templates are excluded to preserve embedded-language semantics.',
    repair:
      'Compute the inner text in a well-named binding before the outer template. Keep conditional computation conditional and preserve evaluation order and side effects. Interpolate the named result into the outer string.',
    exceptions:
      'Sibling templates, tagged templates, and templates in nested function bodies are allowed. No automatic fix because hoisting can change when expressions execute.',
    verification:
      'Run bun run lint and focused tests covering each interpolation branch and any side effects. Source: CONVENTIONS.md, Write the idiom the analyzer expects.',
    invalid: [`const text = \`Hello \${\`user \${name}\`}\`;`],
    valid: [`const userLabel = \`user \${name}\`; const text = \`Hello \${userLabel}\`;`],
  },
  {
    meta: {
      messages: {
        violation:
          'Nested template literals obscure interpolation boundaries. Name the inner value before constructing the outer string, preserving conditional evaluation. Run bun run --cwd packages/lint-rules rules no-nested-templates for the repair guide.',
      },
    },
    create(context) {
      return {
        TemplateLiteral(node) {
          if (node.parent.type === 'TaggedTemplateExpression') return;
          let ancestor = node.parent;
          while (ancestor) {
            if (
              ['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(
                ancestor.type,
              )
            )
              return;
            if (ancestor.type === 'TaggedTemplateExpression') return;
            if (ancestor.type === 'TemplateLiteral') {
              if (ancestor.parent.type === 'TaggedTemplateExpression') return;
              context.report({ node, messageId: 'violation' });
              return;
            }
            ancestor = ancestor.parent;
          }
        },
      };
    },
  },
);
