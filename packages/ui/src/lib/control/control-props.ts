import type { ControlShape } from './control-types';

export type Bag = Readonly<Record<string, unknown>>;

const NO_OPTIONS: Bag = Object.freeze({});
const NO_KEYS: ReadonlySet<string> = new Set();

export const propOf = (props: object, name: string): unknown => Reflect.get(props, name);

/** The state a control starts from: each key's declared value, or its
 *  `default<Key>` prop when the component was given one. */
export function initialState(definition: ControlShape, props: object): Bag {
  const state: Record<string, unknown> = { ...definition.state };
  for (const { key, initial } of definition.keys) {
    const given = propOf(props, initial);
    if (given !== undefined) {
      state[key] = given;
    }
  }
  return state;
}

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
export function optionsOf(definition: ControlShape, props: object): Bag {
  if (definition.optionNames.length === 0) {
    return NO_OPTIONS;
  }
  const options: Record<string, unknown> = { ...definition.options };
  for (const name of definition.optionNames) {
    const given = propOf(props, name);
    if (given !== undefined) {
      options[name] = given;
    }
  }
  return options;
}

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
