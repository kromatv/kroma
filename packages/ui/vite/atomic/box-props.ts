// A `<Box>`'s shorthand props, compiled the way a `styles()` entry is: the
// element states its layout as attributes, the build resolves them to the
// leaf the runtime would have resolved at every render, and the element wears
// that leaf through its `style` instead.

import { BOX_STYLE_PROPS } from '../../src/core/shorthands.ts';
import { type CompiledLeaf, compileDeclaration } from './declaration.ts';
import { evaluate } from './evaluate.ts';
import { type ModuleLoader, type ModuleScope, type Node, Unstatic } from './module-scope.ts';

const BOX_SOURCES = new Set([
  '#ui/components/atoms/box',
  '#ui/components/atoms',
  '@kromatv/ui/kit',
  '@kromatv/ui',
]);

/** One `<Box>` whose every shorthand prop is known before the app runs. */
export interface BoxLeaf {
  readonly shorthand: readonly Node[];
  readonly style: Node | null;
  readonly nameEnd: number;
  readonly leaf: CompiledLeaf;
}

/** The names this module gives the kit's `<Box>`. */
export function boxLocals(scope: ModuleScope): Set<string> {
  const out = new Set<string>();
  for (const [local, { source, imported }] of scope.imports) {
    if (imported === 'Box' && BOX_SOURCES.has(source)) out.add(local);
  }
  return out;
}

function attributeName(attribute: Node): string | null {
  const name = attribute.name as Node;
  return name.type === 'JSXIdentifier' ? (name.name as string) : null;
}

function attributeValue(attribute: Node, scope: ModuleScope, loader: ModuleLoader): unknown {
  const value = attribute.value as Node | null;
  if (value === null) return true;
  if (value.type === 'Literal') return value.value;
  if (value.type !== 'JSXExpressionContainer') throw new Unstatic(`a ${value.type} attribute`);
  const expression = value.expression as Node;
  if (expression.type === 'JSXEmptyExpression') throw new Unstatic('an empty attribute');
  return evaluate(expression, scope, loader);
}

/**
 * The compiled layout of a `<Box>` opening element, or null for one that is not
 * the kit's box or states no shorthand. Throws {@link Unstatic} for one whose
 * layout only a render knows, which then resolves at runtime as written.
 */
export function compileBox(
  opening: Node,
  locals: ReadonlySet<string>,
  scope: ModuleScope,
  loader: ModuleLoader,
): BoxLeaf | null {
  const name = opening.name as Node;
  if (name.type !== 'JSXIdentifier' || !locals.has(name.name as string)) return null;
  const shorthand: Node[] = [];
  const decl: Record<string, unknown> = {};
  let style: Node | null = null;
  for (const attribute of opening.attributes as Node[]) {
    if (attribute.type === 'JSXSpreadAttribute') throw new Unstatic('a box with spread props');
    const prop = attributeName(attribute);
    if (prop === 'style') {
      const value = attribute.value as Node | null;
      if (value?.type !== 'JSXExpressionContainer')
        throw new Unstatic('a style that is no expression');
      style = value.expression as Node;
      continue;
    }
    if (prop === null || !BOX_STYLE_PROPS.has(prop)) continue;
    const value = attributeValue(attribute, scope, loader);
    shorthand.push(attribute);
    if (value !== undefined) decl[prop] = value;
  }
  if (shorthand.length === 0) return null;
  return { shorthand, style, nameEnd: name.end, leaf: compileDeclaration(decl) };
}
