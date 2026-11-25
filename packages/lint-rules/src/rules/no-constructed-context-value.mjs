import { defineRule } from '../define-rule.mjs';

const CONTEXT_NAME = /(?:Context|Ctx)$/;
const BUILT = new Set([
  'ObjectExpression',
  'ArrayExpression',
  'ArrowFunctionExpression',
  'FunctionExpression',
  'ClassExpression',
  'NewExpression',
  'JSXElement',
  'JSXFragment',
]);

const MEMO = new Set(['useMemo', 'useCallback']);
const OUTSIDE_RENDER = new Set(['module', 'global']);
const FOLLOWED = 8;

const factory = (init) =>
  init?.type === 'CallExpression' ? (init.callee.property?.name ?? init.callee.name) : null;

function branches(node) {
  if (node?.type === 'ConditionalExpression') {
    return [node.consequent, node.alternate];
  }
  return node?.type === 'LogicalExpression' ? [node.left, node.right] : null;
}

function builtHere(node) {
  if (node?.type === 'CallExpression') {
    return !MEMO.has(factory(node));
  }
  return node?.type === 'TemplateLiteral';
}

function declared(context, identifier) {
  for (let scope = context.sourceCode.getScope(identifier); scope; scope = scope.upper) {
    const variable = scope.set.get(identifier.name);
    if (variable) {
      return OUTSIDE_RENDER.has(scope.type) ? null : variable.defs[0];
    }
  }
  return null;
}

function renderConst(context, identifier) {
  const definition = declared(context, identifier);
  const named = definition?.type === 'Variable' && definition.node.id.type === 'Identifier';
  return named ? definition.node.init : null;
}

function built(node, context, hops) {
  const split = branches(node);
  if (split) {
    return split.some((part) => built(part, context, hops));
  }
  if (node?.type === 'Identifier') {
    return hops < FOLLOWED && built(renderConst(context, node), context, hops + 1);
  }
  return BUILT.has(node?.type) || (hops === 0 && builtHere(node));
}

function contextTag(node, known) {
  const name = node.name.type === 'JSXIdentifier' ? node.name.name : '';
  return known.parts.has(name) || (CONTEXT_NAME.test(name) && !known.created.has(name));
}

function declare(node, known) {
  const made = factory(node.init);
  if (made === 'partContext' && node.id.type === 'ArrayPattern') {
    known.parts.add(node.id.elements[0]?.name);
  } else if (made === 'createContext' && node.id.type === 'Identifier') {
    known.created.add(node.id.name);
  }
}

export default defineRule(
  'no-constructed-context-value',
  {
    description:
      'A context written as its own provider (<Ctx value={...}>) is given a value held still across renders.',
    why: 'A context value is read past an unchanged element, so a fresh one re-renders every consumer below it. react/jsx-no-constructed-context-values sees <Ctx.Provider> and a context created by createContext in the same file, but not the React 19 form on an imported context or a partContext binding, which is how the kit writes most of its contexts.',
    scope:
      'JSX elements named by a partContext binding of the file, or by an identifier ending in Context or Ctx that the file does not create with createContext (the built-in rule covers that one), whose value is built during render the way react/jsx-no-constructed-context-values reads it: an object, array, function, class, new expression or JSX, directly or through a const in the component, and a call other than useMemo or useCallback or a template literal written in the attribute.',
    repair:
      'Wrap the value in useMemo or useCallback with its real dependencies, or hoist it out of the component when it depends on nothing.',
    exceptions:
      'A context imported under a name that does not end in Context or Ctx is not recognised. A const holding the result of a call is not followed, as the built-in rule does not follow it.',
    verification:
      'Run bun run lint and bun run --cwd packages/lint-rules test, then bun run perf:scan for the same fault across files.',
    invalid: [
      "import { RowContext } from './row-context'; const A = () => <RowContext value={{ go }}>{kids}</RowContext>;",
    ],
    valid: [
      "import { RowContext } from './row-context'; const A = () => <RowContext value={held}>{kids}</RowContext>;",
    ],
  },
  {
    meta: {
      messages: {
        built:
          'This context value is built during render, so every consumer re-renders each time. Wrap it in useMemo or useCallback. Run bun run --cwd packages/lint-rules rules no-constructed-context-value.',
      },
    },
    create(context) {
      const known = { parts: new Set(), created: new Set() };
      return {
        VariableDeclarator(node) {
          declare(node, known);
        },
        JSXOpeningElement(node) {
          const value = node.attributes.find((attr) => attr.name?.name === 'value')?.value;
          if (
            contextTag(node, known) &&
            value?.type === 'JSXExpressionContainer' &&
            built(value.expression, context, 0)
          ) {
            context.report({ node: value, messageId: 'built' });
          }
        },
      };
    },
  },
);
