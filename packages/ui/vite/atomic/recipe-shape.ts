// Reading a recipe's config as written: which nodes are its layers, and which
// of its slots are styles rather than a component's props.

import type { Node } from './module-scope.ts';

/** The named members of an object literal, in source order. */
export function properties(object: Node): Map<string, Node> {
  const out = new Map<string, Node>();
  for (const property of object.properties as Node[]) {
    if (property.type !== 'Property' || property.computed) continue;
    const key = property.key as Node;
    const name = key.type === 'Identifier' ? (key.name as string) : String(key.value);
    out.set(name, property.value as Node);
  }
  return out;
}

export interface RecipeLayers {
  /** `base` recipes have one unnamed slot, `root`; slotted ones name theirs. */
  readonly flat: boolean;
  readonly slots: readonly string[];
  /** Every layer: the base or the slots, each variant option, each compound
   *  rule's style. */
  readonly layers: readonly Node[];
}

function optionNodes(variants: Node): Node[] | string {
  if (variants.type !== 'ObjectExpression') return 'variants not written inline';
  const out: Node[] = [];
  for (const [, group] of properties(variants)) {
    if (group.type !== 'ObjectExpression') return 'a variant group not written inline';
    for (const [, option] of properties(group)) out.push(option);
  }
  return out;
}

function compoundNodes(compound: Node): Node[] | string {
  if (compound.type !== 'ArrayExpression') return 'compound not written inline';
  const out: Node[] = [];
  for (const rule of compound.elements as (Node | null)[]) {
    if (rule?.type !== 'ObjectExpression') return 'a compound rule not written inline';
    const style = properties(rule).get('style');
    if (!style) return 'a compound rule without style';
    out.push(style);
  }
  return out;
}

/** The layers of a recipe config, or the reason it cannot be read as one. */
export function recipeLayers(config: Node): RecipeLayers | string {
  if (config.type !== 'ObjectExpression') return 'a recipe not written inline';
  const props = properties(config);
  const base = props.get('base');
  const slots = props.get('slots');
  const flat = base !== undefined;
  if (!flat && slots?.type !== 'ObjectExpression') return 'a recipe without inline slots';
  const layers: Node[] = [];
  if (base) layers.push(base);
  if (slots) layers.push(slots);
  const variants = props.get('variants');
  if (variants) {
    const options = optionNodes(variants);
    if (typeof options === 'string') return options;
    layers.push(...options);
  }
  const compound = props.get('compound');
  if (compound) {
    const rules = compoundNodes(compound);
    if (typeof rules === 'string') return rules;
    layers.push(...rules);
  }
  return { flat, slots: flat || !slots ? ['root'] : [...properties(slots).keys()], layers };
}

function memberName(member: Node): string {
  const key = member.key as Node;
  return key.type === 'Identifier' ? (key.name as string) : String(key.value);
}

function isStyleDecl(member: Node): boolean {
  const annotation = (member.typeAnnotation as Node | null)?.typeAnnotation as Node | undefined;
  if (annotation?.type !== 'TSTypeReference') return false;
  return (annotation.typeName as Node).name === 'StyleDecl';
}

/**
 * The slots `svFor<{ root: StyleDecl; icon: IconProps }>()` declares as styles;
 * a slot typed as anything else feeds a component's props and stays as
 * written. Null when the type is not an inline literal the reader can see.
 */
export function styleSlotsOf(typeArguments: Node | null | undefined): Set<string> | null {
  const literal = (typeArguments?.params as Node[] | undefined)?.[0];
  if (literal?.type !== 'TSTypeLiteral') return null;
  const styled = new Set<string>();
  for (const member of literal.members as Node[]) {
    if (member.type !== 'TSPropertySignature' || member.computed) continue;
    if (isStyleDecl(member)) styled.add(memberName(member));
  }
  return styled;
}
