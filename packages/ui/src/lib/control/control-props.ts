import type { ControlShape, Slot } from './control-types';

export type Bag = Readonly<Record<string, unknown>>;

const NO_OPTIONS: Bag = Object.freeze({});
const NO_KEYS: ReadonlySet<string> = new Set();

export const propOf = (props: object, name: string): unknown => Reflect.get(props, name);

function filled(defaults: object, slots: readonly Slot[], props: object): Bag {
  const values: Record<string, unknown> = { ...defaults };
  for (const { key, from } of slots) {
    const given = propOf(props, from);
    if (given !== undefined) {
      values[key] = given;
    }
  }
  return values;
}

/** The state a control starts from: each key's declared value, or its
 *  `default<Key>` prop when the component was given one. */
export const initialState = (definition: ControlShape, props: object): Bag =>
  filled(definition.state, definition.keys, props);

/** The keys the app owns: those whose prop was present at mount. */
export function controlledKeys(definition: ControlShape, props: object): ReadonlySet<string> {
  const owned = definition.keys.filter(({ key }) => propOf(props, key) !== undefined);
  return owned.length === 0 ? NO_KEYS : new Set(owned.map(({ key }) => key));
}

/** The state as it reads now: the control's own values, with the app's over
 *  the keys it owns. */
export function stateOf(own: Bag, props: object, controlled: ReadonlySet<string>): Bag {
  if (controlled.size === 0) {
    return own;
  }
  const state: Record<string, unknown> = { ...own };
  for (const key of controlled) {
    state[key] = propOf(props, key);
  }
  return state;
}

/** The options with their defaults under whatever the props give. */
export const optionsOf = (definition: ControlShape, props: object): Bag =>
  definition.optionKeys.length === 0
    ? NO_OPTIONS
    : filled(definition.options, definition.optionKeys, props);

/** The props the control does not read, for the component to pass on. */
export function restOf(definition: ControlShape, props: object): Bag {
  const rest: Record<string, unknown> = {};
  for (const name of Object.keys(props)) {
    if (!definition.owned.has(name)) {
      rest[name] = propOf(props, name);
    }
  }
  return rest;
}

export function sameBag(a: Bag, b: Bag): boolean {
  if (a === b) {
    return true;
  }
  const names = Object.keys(a);
  return (
    names.length === Object.keys(b).length && names.every((name) => Object.is(a[name], b[name]))
  );
}
