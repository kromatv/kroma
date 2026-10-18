import { defineRule } from '../define-rule.mjs';

function isUseState(call) {
  if (call?.type !== 'CallExpression') return false;
  const { callee } = call;
  if (callee.type === 'Identifier') return callee.name === 'useState';
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'useState'
  );
}

function setterOf(name) {
  return `set${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

export default defineRule(
  'use-state-pair',
  {
    description:
      'Destructure useState into its value and a setter named after it: [open, setOpen].',
    why: 'SonarCloud raises S6754 on a useState result that is not destructured, or whose setter is named after something else, and fails the quality gate on new code. A setter named after its value is how a reader pairs them at a glance.',
    scope:
      'Variable declarations initialised with useState(…) or React.useState(…). A declaration that keeps the value alone, [value], is allowed: that is a value created once and never set.',
    repair:
      'Destructure the call, and rename either side so the setter is set followed by the value name with its first letter capitalised: [tab, setTab], [isOpen, setIsOpen].',
    exceptions:
      'Object or nested patterns on either side are not checked, and neither are hooks other than useState.',
    verification:
      'Run bun run lint and the workspace typecheck after renaming, and update every reference to the renamed binding. Mirrors Sonar rule S6754 (react hook-use-state, value-only destructuring allowed).',
    invalid: [
      "const [chosen, setTab] = useState('all');",
      'const state = useState(0);',
      'const [count, update] = React.useState(0);',
    ],
    valid: [
      "const [tab, setTab] = useState('all');",
      'const [isOpen, setIsOpen] = React.useState(false);',
      'const [slide] = useState(() => new Animated.Value(1));',
    ],
  },
  {
    meta: {
      type: 'suggestion',
      messages: {
        notDestructured:
          'Destructure useState into [value, setValue] (Sonar S6754). Run bun run --cwd packages/lint-rules rules use-state-pair for the repair.',
        asymmetric:
          'Name the setter `{{expected}}` after its value `{{value}}` (Sonar S6754). Run bun run --cwd packages/lint-rules rules use-state-pair for the repair.',
      },
    },
    create(context) {
      return {
        VariableDeclarator(node) {
          if (!isUseState(node.init)) return;
          if (node.id.type !== 'ArrayPattern') {
            context.report({ node: node.id, messageId: 'notDestructured' });
            return;
          }
          const [value, setter] = node.id.elements;
          if (value?.type !== 'Identifier' || setter?.type !== 'Identifier') return;
          const expected = setterOf(value.name);
          if (setter.name !== expected) {
            context.report({
              node: setter,
              messageId: 'asymmetric',
              data: { expected, value: value.name },
            });
          }
        },
      };
    },
  },
);
