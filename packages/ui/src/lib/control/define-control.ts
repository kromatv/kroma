import type { Bag } from './control-props';
import type {
  ActionArgs,
  Actions,
  ControlDefinition,
  ControlShape,
  StateKey,
} from './control-types';

/** An action as the engine runs it, its types unknown. */
export type AnyAction = (now: Bag, ...args: readonly unknown[]) => object;

/** A definition as the engine and a tool hold it, its types unknown. */
export type AnyDefinition = ControlShape & {
  readonly actions: Readonly<Record<string, AnyAction>>;
};

type Loose = {
  state: object;
  options?: object;
  actions?: Readonly<Record<string, AnyAction>>;
};

const NOTHING = Object.freeze({});

const capital = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

function stateKey(key: string): StateKey {
  const name = capital(key);
  return { key, from: `default${name}`, change: `on${name}Change`, setter: `set${name}` };
}

function clash(control: string, names: readonly string[]): void {
  const twice = names.find((name, at) => names.indexOf(name) !== at);
  if (twice) {
    throw new Error(`The ${control} control names "${twice}" twice`);
  }
}

/**
 * Declares a kind of control once: its state with the value each key starts
 * from, the options it reads with their defaults, and its actions. An action
 * reads the state and the options as they are now and answers with the keys it
 * changes.
 *
 * ```ts
 * const counter = defineControl('counter', {
 *   state: { value: 0 },
 *   options: { step: 1, max: 10 },
 *   actions: {
 *     increment: ({ value, step, max }) => ({ value: Math.min(max, value + step) }),
 *     jump: (_now, to: number) => ({ value: to }),
 *   },
 * });
 * ```
 *
 * A component built on it with `useControl` takes `value`, `defaultValue`,
 * `onValueChange(next, details)`, `step` and `max`, and gets `value`, `step`,
 * `max`, `setValue(next)`, `increment()` and `jump(to)`.
 */
export function defineControl<
  S extends object,
  O extends object = object,
  A extends ActionArgs = ActionArgs,
>(
  name: string,
  parts: { readonly state: S; readonly options?: O; readonly actions?: Actions<S, O, A> },
): ControlDefinition<S, O, A>;
export function defineControl(name: string, parts: Loose): AnyDefinition {
  const options = parts.options ?? NOTHING;
  const actions = parts.actions ?? NOTHING;
  const keys = Object.keys(parts.state).map(stateKey);
  const optionNames = Object.keys(options);
  const read = keys.flatMap(({ key, from, change }) => [key, from, change]);
  clash(name, [
    ...keys.map(({ key }) => key),
    ...keys.map(({ setter }) => setter),
    ...optionNames,
    ...Object.keys(actions),
  ]);
  return {
    name,
    state: parts.state,
    options,
    actions,
    keys,
    keyOf: new Map(keys.map((entry) => [entry.key, entry])),
    optionKeys: optionNames.map((key) => ({ key, from: key })),
    owned: new Set([...read, ...optionNames]),
  };
}
