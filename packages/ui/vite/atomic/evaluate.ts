// What a declaration is worth before the app runs: a static evaluator over the
// parts of a module a style may be written from. Literals, the module's own
// constants, arithmetic on them, and a constant imported from another file in
// the workspace. Anything else is not static, and says so.

import {
  type ModuleLoader,
  type ModuleScope,
  type Node,
  nameOf,
  Unstatic,
} from './module-scope.ts';

const MAX_DEPTH = 200;

const MAX_MODULE_CHAIN = 6;

interface Frame {
  scope: ModuleScope;
  loader: ModuleLoader;
  depth: number;
  chain: number;
}

const arithmetic: Record<string, (a: number, b: number) => number> = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  '%': (a, b) => a % b,
  '**': (a, b) => a ** b,
};

function binary(node: Node, frame: Frame): unknown {
  const a = evaluateIn(node.left as Node, frame);
  const b = evaluateIn(node.right as Node, frame);
  const op = node.operator as string;
  if (op === '+' && (typeof a === 'string' || typeof b === 'string')) return String(a) + String(b);
  const fn = arithmetic[op];
  if (fn && typeof a === 'number' && typeof b === 'number') return fn(a, b);
  throw new Unstatic(`the operator ${op}`);
}

function logical(node: Node, frame: Frame): unknown {
  const a = evaluateIn(node.left as Node, frame);
  const right = () => evaluateIn(node.right as Node, frame);
  if (node.operator === '??') return a ?? right();
  if (node.operator === '||') return a || right();
  return a && right();
}

function unary(node: Node, frame: Frame): unknown {
  const value = evaluateIn(node.argument as Node, frame);
  switch (node.operator) {
    case '-':
      if (typeof value === 'number') return -value;
      break;
    case '+':
      if (typeof value === 'number') return value;
      break;
    case '!':
      return !value;
    default:
  }
  throw new Unstatic(`the operator ${String(node.operator)}`);
}

function object(node: Node, frame: Frame): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const property of node.properties as Node[]) {
    if (property.type === 'SpreadElement') {
      const spread = evaluateIn(property.argument as Node, frame);
      if (typeof spread !== 'object' || spread === null)
        throw new Unstatic('a spread of a non-object');
      Object.assign(out, spread);
      continue;
    }
    if (property.type !== 'Property' || property.kind !== 'init') {
      throw new Unstatic(`a ${property.type} member`);
    }
    const key = property.computed
      ? String(evaluateIn(property.key as Node, frame))
      : nameOf(property.key as Node);
    out[key] = evaluateIn(property.value as Node, frame);
  }
  return out;
}

function array(node: Node, frame: Frame): unknown[] {
  const out: unknown[] = [];
  for (const element of node.elements as (Node | null)[]) {
    if (element === null) {
      out.push(null);
    } else if (element.type === 'SpreadElement') {
      const spread = evaluateIn(element.argument as Node, frame);
      if (!Array.isArray(spread)) throw new Unstatic('a spread of a non-array');
      out.push(...spread);
    } else {
      out.push(evaluateIn(element, frame));
    }
  }
  return out;
}

function identifier(node: Node, frame: Frame): unknown {
  const name = node.name as string;
  if (name === 'undefined') return undefined;
  const local = frame.scope.consts.get(name);
  if (local) return evaluateIn(local, { ...frame, depth: frame.depth + 1 });
  const imported = frame.scope.imports.get(name);
  if (!imported) throw new Unstatic(`the binding ${name}`);
  const target = frame.loader.resolve(imported.source, frame.scope.file);
  if (!target) throw new Unstatic(`${name} from ${imported.source}`);
  if (frame.chain >= MAX_MODULE_CHAIN) throw new Unstatic(`${name}: too many modules deep`);
  const found = frame.loader.exportOf(target, imported.imported, frame.chain + 1);
  return evaluateIn(found.init, {
    scope: found.scope,
    loader: frame.loader,
    depth: frame.depth + 1,
    chain: frame.chain + 1,
  });
}

function member(node: Node, frame: Frame): unknown {
  const target = evaluateIn(node.object as Node, frame);
  const key = node.computed
    ? String(evaluateIn(node.property as Node, frame))
    : nameOf(node.property as Node);
  if (typeof target !== 'object' || target === null)
    throw new Unstatic(`a member of ${typeof target}`);
  return (target as Record<string, unknown>)[key];
}

function call(node: Node, frame: Frame): unknown {
  const callee = node.callee as Node;
  const args = node.arguments as Node[];
  const method =
    callee.type === 'MemberExpression' && !callee.computed
      ? ((callee.property as Node).name as string)
      : null;
  const receiver = callee.type === 'MemberExpression' ? (callee.object as Node) : null;
  if (method === 'freeze' && receiver?.type === 'Identifier' && receiver.name === 'Object') {
    const argument = args[0];
    if (argument) return evaluateIn(argument, frame);
  }
  if (method === 'join' && receiver) {
    const list = evaluateIn(receiver, frame);
    const separator = args[0] ? evaluateIn(args[0], frame) : ',';
    if (Array.isArray(list)) return list.join(String(separator));
  }
  throw new Unstatic(`a call to ${nameOfCallee(callee)}`);
}

function nameOfCallee(callee: Node): string {
  if (callee.type === 'Identifier') return callee.name as string;
  if (callee.type === 'MemberExpression' && !callee.computed) {
    return `${nameOfCallee(callee.object as Node)}.${(callee.property as Node).name as string}`;
  }
  return callee.type;
}

function template(node: Node, frame: Frame): string {
  let out = '';
  const quasis = node.quasis as Node[];
  const expressions = node.expressions as Node[];
  quasis.forEach((quasi, i) => {
    out += (quasi.value as { cooked: string }).cooked;
    const expression = expressions[i];
    if (expression) out += String(evaluateIn(expression, frame));
  });
  return out;
}

function evaluateIn(node: Node, frame: Frame): unknown {
  if (frame.depth > MAX_DEPTH) throw new Unstatic('a value nested too deep');
  switch (node.type) {
    case 'Literal':
      if ('regex' in node && node.regex) throw new Unstatic('a regular expression');
      return node.value;
    case 'TemplateLiteral':
      return template(node, frame);
    case 'UnaryExpression':
      return unary(node, frame);
    case 'BinaryExpression':
      return binary(node, frame);
    case 'LogicalExpression':
      return logical(node, frame);
    case 'ConditionalExpression':
      return evaluateIn(node.test as Node, frame)
        ? evaluateIn(node.consequent as Node, frame)
        : evaluateIn(node.alternate as Node, frame);
    case 'ArrayExpression':
      return array(node, frame);
    case 'ObjectExpression':
      return object(node, frame);
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'TSTypeAssertion':
    case 'ParenthesizedExpression':
      return evaluateIn(node.expression as Node, frame);
    case 'Identifier':
      return identifier(node, frame);
    case 'MemberExpression':
      return member(node, frame);
    case 'CallExpression':
      return call(node, frame);
    default:
      throw new Unstatic(`a ${node.type}`);
  }
}

/** The value of `node` in `scope`, or an {@link Unstatic} saying why it has none. */
export function evaluate(node: Node, scope: ModuleScope, loader: ModuleLoader): unknown {
  return evaluateIn(node, { scope, loader, depth: 0, chain: 0 });
}
