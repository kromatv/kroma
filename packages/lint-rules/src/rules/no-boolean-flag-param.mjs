import { defineRule } from '../define-rule.mjs';

const VALUE_TAKERS = /^(?:set|on|handle|with|toggle)[A-Z]/;
const NULLISH = new Set(['TSUndefinedKeyword', 'TSNullKeyword']);

function isBooleanType(type) {
  if (!type) {
    return false;
  }
  if (type.type === 'TSBooleanKeyword') {
    return true;
  }
  return (
    type.type === 'TSUnionType' &&
    type.types.some((member) => member.type === 'TSBooleanKeyword') &&
    type.types.every((member) => member.type === 'TSBooleanKeyword' || NULLISH.has(member.type))
  );
}

function flagOf(param) {
  const target = param.type === 'AssignmentPattern' ? param.left : param;
  if (target.type !== 'Identifier') {
    return null;
  }
  const defaulted =
    param.type === 'AssignmentPattern' &&
    param.right.type === 'Literal' &&
    typeof param.right.value === 'boolean';
  return defaulted || isBooleanType(target.typeAnnotation?.typeAnnotation) ? target : null;
}

function keyName(key) {
  return key?.type === 'Identifier' ? key.name : null;
}

function ownName(node) {
  const { parent } = node;
  if (node.id) {
    return node.id.name;
  }
  if (parent.type === 'VariableDeclarator') {
    return keyName(parent.id);
  }
  if (['Property', 'MethodDefinition', 'PropertyDefinition'].includes(parent.type)) {
    return keyName(parent.key);
  }
  return null;
}

export default defineRule(
  'no-boolean-flag-param',
  {
    description: 'A named function takes no boolean flag parameter.',
    why: 'A boolean parameter says the function does two things, and the call site reads as render(true) with no hint of which. CODE_STYLE.md asks for small functions with one job and for a named type or an options object instead of an argument that needs explaining.',
    scope:
      'Parameters of function declarations, and of function or arrow expressions that have a name of their own (a variable, a property, a method), when the parameter is typed boolean, boolean with undefined or null, or defaults to true or false.',
    repair:
      'Split the function in two, each named after what it does, or take one options object with named fields so the call site says which mode it asks for. When the boolean is the value being carried and not a mode, name the function after that: a setter, a handler or a toggle.',
    exceptions:
      'Destructured parameters are named at the call site and pass. A function named set*, on*, handle*, with* or toggle* carries a value and passes. A callback written inline as an argument or a JSX attribute has its signature chosen by the caller and is not judged. Type-only signatures are not inspected.',
    verification:
      'Run bun run lint and the tests of every caller you changed. Source: CODE_STYLE.md, Beyond comments.',
    invalid: [
      'function render(compact: boolean) {}',
      'const load = (force = false) => {};',
      'const api = { refresh(silent?: boolean) {} };',
    ],
    valid: [
      'function render({ compact }: { compact: boolean }) {}',
      'function setOpen(open: boolean) {}',
      'items.filter((visible: boolean) => visible);',
      '<Switch onValueChange={(next: boolean) => save(next)} />;',
    ],
  },
  {
    meta: {
      messages: {
        flag: 'Boolean parameter "{{name}}" makes this function do two things. Split it into two named functions or take an options object. Run bun run --cwd packages/lint-rules rules no-boolean-flag-param for the repair guide.',
      },
    },
    create(context) {
      function check(node) {
        const name = ownName(node);
        if (!name || VALUE_TAKERS.test(name)) {
          return;
        }
        for (const param of node.params) {
          const flag = flagOf(param);
          if (flag) {
            context.report({ node: flag, messageId: 'flag', data: { name: flag.name } });
          }
        }
      }
      return {
        FunctionDeclaration: check,
        FunctionExpression: check,
        ArrowFunctionExpression: check,
      };
    },
  },
);
