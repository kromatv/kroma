// Finding a control in a rendered story by its accessible name, on every target.
//
// React's fiber tree is the one structure a television and a browser share, so
// this walks that rather than the DOM: half the shells have no document, and the
// half that do put a portal's contents somewhere else entirely - in the fibers a
// dialog is still a child of whatever opened it.

import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';

interface Fiber {
  type: unknown;
  memoizedProps: Record<string, unknown> | string | null;
  child: Fiber | null;
  sibling: Fiber | null;
  return: Fiber | null;
  alternate: Fiber | null;
  stateNode: unknown;
}

type Visit = (fiber: Fiber) => boolean;

const EMPTY: Record<string, unknown> = Object.freeze({});

// react-dom stamps the fiber on the element under a randomised key;
// React Native hands the host instance itself, in one of two spellings
// depending on which renderer built it.
function seedOf(node: object): Fiber | null {
  const bag = node as Record<string, unknown>;
  const handle = bag._internalInstanceHandle ?? bag.__internalInstanceHandle;
  if (handle) return handle as Fiber;
  for (const key of Object.keys(bag)) {
    if (key.startsWith('__reactFiber$')) return bag[key] as Fiber;
  }
  return null;
}

function topOf(fiber: Fiber): Fiber {
  let at = fiber;
  while (at.return) at = at.return;
  return at;
}

// A host node keeps the fiber it was created with, which after an odd number of
// re-renders is the spare half of React's double buffer and holds stale props.
// The root a stale branch climbs to is not the one React committed.
function currentOf(fiber: Fiber): Fiber {
  if (!fiber.alternate) return fiber;
  const live = (topOf(fiber).stateNode as { current?: Fiber } | null)?.current;
  if (!live) return fiber;
  return topOf(fiber) === live ? fiber : fiber.alternate;
}

/** The live fiber for a host node or host instance: whatever a `ref` handed
 * back. Null when React never rendered it. */
function fiberFor(node: object | null | undefined): Fiber | null {
  if (!node) return null;
  const seed = seedOf(node);
  return seed ? currentOf(seed) : null;
}

function propsOf(fiber: Fiber): Record<string, unknown> {
  const props = fiber.memoizedProps;
  return props && typeof props === 'object' ? (props as Record<string, unknown>) : EMPTY;
}

function scan(fiber: Fiber | null, visit: Visit): void {
  for (let at = fiber; at; at = at.sibling) {
    if (visit(at)) scan(at.child, visit);
  }
}

/** Pre-order over `root` and everything under it. A visitor returning false
 * keeps the subtree it was handed unvisited. */
function walk(root: Fiber, visit: Visit): void {
  if (visit(root)) scan(root.child, visit);
}

const NAME_PROPS = ['accessibilityLabel', 'aria-label', 'label'] as const;

function accessibleName(fiber: Fiber): string {
  const props = propsOf(fiber);
  for (const key of NAME_PROPS) {
    const value = props[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

// React Native gives a string its own fiber; react-dom sets a lone string child
// on the host itself and creates none.
function hostText(fiber: Fiber): string | null {
  if (typeof fiber.memoizedProps === 'string') return fiber.memoizedProps;
  if (typeof fiber.type !== 'string') return null;
  const children = propsOf(fiber).children;
  return typeof children === 'string' || typeof children === 'number' ? String(children) : null;
}

/** Every word drawn under `fiber`, in reading order. */
function textOf(fiber: Fiber): string {
  const parts: string[] = [];
  walk(fiber, (at) => {
    const text = hostText(at);
    if (text !== null) parts.push(text);
    return true;
  });
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function isUnder(fiber: Fiber, ancestor: Fiber): boolean {
  for (let at = fiber.return; at; at = at.return) {
    if (at === ancestor) return true;
  }
  return false;
}

function named(root: Fiber, name: string): Fiber[] {
  const found: Fiber[] = [];
  walk(root, (at) => {
    if (accessibleName(at) !== name) return true;
    // A control's own parts carry its name too; the outermost one IS the control.
    found.push(at);
    return false;
  });
  return found;
}

function showing(root: Fiber, name: string): Fiber[] {
  const found: Fiber[] = [];
  walk(root, (at) => {
    if (textOf(at) === name) found.push(at);
    return true;
  });
  return found.filter((at) => !found.some((other) => isUnder(other, at)));
}

/** The controls answering to `name`: those named so outright, or failing that
 * the tightest nodes drawing exactly that text. */
function controlsNamed(root: Fiber, name: string): Fiber[] {
  const byName = named(root, name);
  return byName.length > 0 ? byName : showing(root, name);
}

/** Every accessible name under `root`, deduplicated, in reading order. */
function namesUnder(root: Fiber): string[] {
  const names: string[] = [];
  walk(root, (at) => {
    const name = accessibleName(at);
    if (name && !names.includes(name)) names.push(name);
    return true;
  });
  return names;
}

type Handler = (...args: never[]) => unknown;

function handlerOn(fiber: Fiber, keys: readonly string[]): Handler | null {
  const props = propsOf(fiber);
  for (const key of keys) {
    const value = props[key];
    if (typeof value === 'function') return value as Handler;
  }
  return null;
}

function handlerUnder(control: Fiber, keys: readonly string[]): Handler | null {
  const parts: Fiber[] = [];
  walk(control, (at) => {
    // Another named control below this one is a different control.
    if (at !== control && accessibleName(at)) return false;
    parts.push(at);
    return true;
  });
  for (const at of parts) {
    const found = handlerOn(at, keys);
    if (found) return found;
  }
  return null;
}

function handlerAbove(control: Fiber, root: Fiber, keys: readonly string[]): Handler | null {
  for (let at = control.return; at && at !== root.return; at = at.return) {
    const found = handlerOn(at, keys);
    if (found) return found;
  }
  return null;
}

const PRESS_PROPS = ['onPress'] as const;
const VALUE_PROPS = ['onValueChange', 'onChangeText', 'onChange'] as const;

/** What a press on this control runs: its own handler, one a part of it owns,
 * or - for a control found by the text it draws - the pressable around it. */
function pressHandler(control: Fiber, root: Fiber): Handler | null {
  return handlerUnder(control, PRESS_PROPS) ?? handlerAbove(control, root, PRESS_PROPS);
}

/** What setting this entry's value runs. */
function valueHandler(control: Fiber): Handler | null {
  return handlerUnder(control, VALUE_PROPS);
}

function isDisabled(control: Fiber): boolean {
  const props = propsOf(control);
  return props.disabled === true || props['aria-disabled'] === true;
}

const HIDDEN_PROPS = ['aria-hidden', 'accessibilityElementsHidden'] as const;

function hides(fiber: Fiber): boolean {
  const props = propsOf(fiber);
  if (HIDDEN_PROPS.some((key) => props[key] === true)) return true;
  if (props.importantForAccessibility === 'no-hide-descendants') return true;
  const style = StyleSheet.flatten(props.style as StyleProp<ViewStyle>);
  return style?.display === 'none' || style?.opacity === 0;
}

/** Whether the control is drawn: mounted, and under nothing that hides it. */
function isVisible(control: Fiber, root: Fiber): boolean {
  for (let at: Fiber | null = control; at && at !== root.return; at = at.return) {
    if (hides(at)) return false;
  }
  return true;
}

export type { Fiber };
export {
  controlsNamed,
  fiberFor,
  isDisabled,
  isVisible,
  namesUnder,
  pressHandler,
  textOf,
  valueHandler,
};
