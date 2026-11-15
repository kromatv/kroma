import { defineRule } from '../define-rule.mjs';

function isCallTo(node, method) {
  return (
    node?.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property.name === method
  );
}

function startsAsString(node) {
  let current = node;
  while (current?.type === 'CallExpression' && current.callee.type === 'MemberExpression') {
    if (isCallTo(current, 'string') && current.callee.object.type === 'Identifier') {
      return current.callee.object.name === 'z';
    }
    current = current.callee.object;
  }
  return false;
}

function isMinOne(node) {
  const [length] = node.arguments;
  return isCallTo(node, 'min') && length?.type === 'Literal' && length.value === 1;
}

export default defineRule(
  'zod-nonempty',
  {
    description: 'A zod string that may not be empty is written .nonempty().',
    why: 'z.string().min(1) and z.string().nonempty() check the same thing, and a codebase that writes both makes a reader stop to ask whether they differ. One spelling says the intent, a string that must hold something, and leaves .min(n) for a real length rule.',
    scope:
      'Calls to .min(1), with or without a message, on a chain that starts at z.string(). Arrays, sets, maps and numbers are not inspected.',
    repair:
      'Replace .min(1) with .nonempty(), keeping the message argument when there is one. The fix is automatic: bun run check:fix.',
    exceptions:
      'A schema reached through a variable (const name = z.string(); name.min(1)) is not followed. A minimum other than 1 is a length rule and stays .min(n).',
    verification:
      'Run bun run lint and the tests of the schema. Source: CONVENTIONS.md, Validate with zod, never by hand.',
    invalid: [
      'const name = z.string().min(1);',
      "const name = z.string().trim().min(1, 'required');",
    ],
    valid: [
      'const name = z.string().nonempty();',
      'const name = z.string().min(2);',
      'const tags = z.array(z.string()).min(1);',
    ],
  },
  {
    meta: {
      fixable: 'code',
      messages: {
        nonempty:
          'Write .nonempty() for a string that may not be empty; .min(1) says the same thing less plainly. Run bun run --cwd packages/lint-rules rules zod-nonempty for the repair guide.',
      },
    },
    create(context) {
      return {
        CallExpression(node) {
          if (!isMinOne(node) || !startsAsString(node.callee.object)) {
            return;
          }
          const [length, message] = node.arguments;
          const { property } = node.callee;
          context.report({
            node: property,
            messageId: 'nonempty',
            fix: (fixer) => [
              fixer.replaceText(property, 'nonempty'),
              fixer.removeRange([length.range[0], message ? message.range[0] : length.range[1]]),
            ],
          });
        },
      };
    },
  },
);
