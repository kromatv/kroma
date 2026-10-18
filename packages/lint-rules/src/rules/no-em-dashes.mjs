import { defineRule } from '../define-rule.mjs';

export default defineRule(
  'no-em-dashes',
  {
    description: 'Use commas, colons, or full stops instead of em dashes in source prose.',
    why: 'CONVENTIONS.md explicitly prohibits em dashes in comments, user-facing copy, and documentation. A consistent mechanical check prevents generated copy from drifting from that house preference.',
    scope:
      'JS/TS comments, string literals (including JSX attributes), JSX text, and template-literal text (cooked for untagged templates, raw for tagged templates). Unicode escape spellings in strings are checked after decoding.',
    repair:
      'Rewrite the sentence with a comma, colon, or full stop, whichever preserves its meaning. If the character is intentional external/protocol test data, use a narrowly justified suppression rather than changing the data.',
    exceptions:
      'Regular expressions and generated files excluded by config are allowed. Markdown/JSON/CSS files are outside Oxlint coverage; this rule does not claim to lint documentation files. No automatic punctuation replacement because sentence structure matters.',
    verification:
      'Run bun run lint and check any modified user-facing copy for meaning and French spelling. Source: CONVENTIONS.md, No em dashes.',
    invalid: [`const text = "Start ${String.fromCodePoint(0x2014)} end";`],
    valid: ['const text = "Start: end";'],
  },
  {
    meta: {
      messages: {
        violation:
          'An em dash violates the house prose style. Rewrite the sentence with a comma, colon, or full stop while preserving its meaning. Run bun run --cwd packages/lint-rules rules no-em-dashes for the repair guide.',
      },
    },
    create(context) {
      const emDash = String.fromCodePoint(0x2014);
      function check(node, text) {
        if (typeof text === 'string' && text.includes(emDash))
          context.report({ node, messageId: 'violation' });
      }
      return {
        Program() {
          for (const comment of context.sourceCode.getAllComments()) {
            if (comment.value.includes(emDash))
              context.report({ loc: comment.loc, messageId: 'violation' });
          }
        },
        Literal: (node) => check(node, node.value),
        JSXText: (node) => check(node, node.value),
        TemplateElement: (node) =>
          check(
            node,
            node.parent.parent.type === 'TaggedTemplateExpression'
              ? node.value.raw
              : (node.value.cooked ?? node.value.raw),
          ),
      };
    },
  },
);
