// <Slot>: render your props onto your child instead of onto an element of your
// own. Radix's composition idea (radix-ui.com/primitives/docs/guides/composition)
// rebuilt for a tree that is React Native on one target and react-native-web on
// the next, where the automatic merge Radix leans on does not exist: `style` is
// a positional array, the press family is several handlers, and a host ref is a
// component instance rather than a node.
//
// So the merge is DEFINED, not guessed, and it is the whole of this file:
//
//   - the child's own props win over the slot's, prop by prop;
//   - `style` composes as `[slot, child]`, the child's declarations last, which
//     is React Native's own precedence for a style array;
//   - two handlers for the same event BOTH run, the child's first;
//   - two refs both attach.
//
// Anything subtler than that (state-dependent styles, slots, focus scales) is
// not a merge and never will be: it stays on the component that owns it.

import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';

type AnyProps = Record<string, unknown>;

function composeHandlers(child: unknown, slot: unknown): unknown {
  if (typeof child !== 'function') return slot;
  if (typeof slot !== 'function') return child;
  return (...args: unknown[]) => {
    child(...args);
    slot(...args);
  };
}

function composeRefs<T>(child: Ref<T> | undefined, slot: Ref<T> | undefined): Ref<T> | undefined {
  if (!child) return slot;
  if (!slot) return child;
  return (node: T | null) => {
    for (const ref of [child, slot]) {
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    }
  };
}

function isHandler(name: string, value: unknown): boolean {
  return (
    typeof value === 'function' &&
    name.length > 2 &&
    name.startsWith('on') &&
    name[2] === name[2]?.toUpperCase()
  );
}

/** The slot's props and the child's, merged under the rules above. For a kit
 * component that merges without rendering a <Slot> element; the shells reach
 * this through `<Slot>` itself. */
function mergeSlotProps(slotProps: AnyProps, childProps: AnyProps): AnyProps {
  const merged: AnyProps = { ...slotProps, ...childProps };
  for (const [name, slotValue] of Object.entries(slotProps)) {
    if (!(name in childProps)) continue;
    const childValue = childProps[name];
    if (name === 'style') {
      merged.style = childValue == null ? slotValue : [slotValue, childValue];
    } else if (name === 'ref') {
      merged.ref = composeRefs(childValue as Ref<unknown>, slotValue as Ref<unknown>);
    } else if (isHandler(name, slotValue) || isHandler(name, childValue)) {
      merged[name] = composeHandlers(childValue, slotValue);
    }
  }
  return merged;
}

interface SlotProps {
  /** Exactly one element. Text, a fragment or a list is a real mistake: there
   *  is no single child to become. */
  children: ReactNode;
  [prop: string]: unknown;
}

/**
 * Renders its props onto its one child. The building block behind every
 * `asChild` prop in the kit: `<Box asChild>` is `<Slot {...boxProps}>`.
 *
 * ```tsx
 * <Slot style={s.well} onPress={open}>
 *   <Pressable onPress={track} style={s.tile} />
 * </Slot>
 * // one <Pressable style={[s.well, s.tile]}> that calls track, then open
 * ```
 */
function Slot({ children, ...slotProps }: Readonly<SlotProps>) {
  const child = Children.only(children);
  if (!isValidElement(child)) throw new Error('<Slot> needs exactly one element child');
  const el = child as ReactElement<AnyProps> & { ref?: Ref<unknown> };
  // React 19: the ref rides on props for a function component, but cloneElement
  // still carries the element's own ref separately.
  const childProps: AnyProps =
    el.ref !== undefined && !('ref' in el.props) ? { ...el.props, ref: el.ref } : el.props;
  return cloneElement(el, mergeSlotProps(slotProps, childProps));
}

export type { SlotProps };
export { mergeSlotProps, Slot };
