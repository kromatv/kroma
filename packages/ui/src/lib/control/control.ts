import { type ControlEngine, createControlEngine } from './control-engine';
import {
  type Bag,
  controlledKeys,
  initialState,
  optionsOf,
  propOf,
  sameBag,
  stateOf,
} from './control-props';
import type {
  ActionArgs,
  Bound,
  ChangeDetails,
  ChangeSource,
  ControlDefinition,
  PropsOf,
  Setters,
} from './control-types';
import type { AnyDefinition } from './define-control';

type AnyActions = Readonly<Record<string, (...args: readonly unknown[]) => boolean>>;

/** One mounted control, as the engine and a tool hold it. */
export type Control = {
  readonly definition: AnyDefinition;
  /** Every setter and every action, by name. Each answers false when nothing
   *  changed or the app refused. */
  readonly actions: AnyActions;
  readonly state: () => Bag;
  readonly options: () => Bag;
  /** The control's own values, which is what a component subscribes to. */
  readonly own: () => Bag;
  readonly subscribe: (listener: () => void) => () => void;
  /** Hands the control the props of the render that just committed. */
  readonly sync: (props: object) => void;
  /** Joins the engine, and leaves it when the returned function is called. */
  readonly attach: () => () => void;
  /** What a component renders from, the same object while nothing in it moved. */
  readonly view: (own: Bag, props: object) => object;
};

/** The same control, as the code that knows its definition holds it. */
export type ControlHandle<S, O, A extends ActionArgs> = Omit<
  Control,
  'definition' | 'actions' | 'state' | 'options'
> & {
  readonly definition: ControlDefinition<S, O, A>;
  readonly actions: Setters<S> & Bound<A>;
  readonly state: () => Readonly<S>;
  readonly options: () => Readonly<O>;
};

function createDetails(reason: string, source: ChangeSource): ChangeDetails {
  let canceled = false;
  return {
    reason,
    source,
    get canceled() {
      return canceled;
    },
    cancel: () => {
      canceled = true;
    },
  };
}

function createStore(definition: AnyDefinition, first: object) {
  const controlled = controlledKeys(definition, first);
  const listeners = new Set<() => void>();
  let props = first;
  let own = initialState(definition, first);
  return {
    own: () => own,
    props: () => props,
    state: () => stateOf(own, props, controlled),
    stateFor: (ownNow: Bag, propsNow: object) => stateOf(ownNow, propsNow, controlled),
    sync: (next: object) => {
      props = next;
    },
    write: (key: string, next: unknown) => {
      if (controlled.has(key)) {
        return;
      }
      own = { ...own, [key]: next };
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

type Store = ReturnType<typeof createStore>;

function tell(listener: unknown, next: unknown, details: ChangeDetails) {
  if (typeof listener === 'function') {
    listener(next, details);
  }
}

function createView(actions: AnyActions) {
  let last: { state: Bag; options: Bag; view: object } | null = null;
  return (state: Bag, options: Bag): object => {
    if (last && sameBag(last.state, state) && sameBag(last.options, options)) {
      return last.view;
    }
    const view = { ...state, ...options, ...actions };
    last = { state, options, view };
    return view;
  };
}

type Change = (key: string, next: unknown, reason: string) => boolean;

function apply(patch: object, change: Change, reason: string): boolean {
  let changed = false;
  for (const [key, next] of Object.entries(patch)) {
    changed = change(key, next, reason) || changed;
  }
  return changed;
}

function bind(definition: AnyDefinition, change: Change, now: () => Bag): AnyActions {
  const actions: Record<string, (...args: readonly unknown[]) => boolean> = {};
  for (const { key, setter } of definition.keys) {
    actions[setter] = (next, reason) =>
      change(key, next, typeof reason === 'string' ? reason : 'set');
  }
  for (const [name, action] of Object.entries(definition.actions)) {
    actions[name] = (...args) => apply(action(now(), ...args), change, name);
  }
  return actions;
}

type Wiring = { definition: AnyDefinition; store: Store; engine: ControlEngine };

function createChange({ definition, store, engine }: Wiring, self: () => Control): Change {
  return (key, next, reason) => {
    const names = definition.keyOf.get(key);
    const previous = store.state()[key];
    if (!names || Object.is(previous, next)) {
      return false;
    }
    const details = createDetails(reason, engine.source());
    tell(propOf(store.props(), names.change), next, details);
    if (details.canceled) {
      return false;
    }
    store.write(key, next);
    engine.report({ control: self(), key, previous, next, details });
    return true;
  };
}

/**
 * One mounted control: its state, the one path its changes take, and its
 * actions. Given an engine, it is listed there while attached and every change
 * that takes effect is reported to it.
 */
export function createControl<S extends object, O extends object, A extends ActionArgs>(
  definition: ControlDefinition<S, O, A>,
  first: PropsOf<S, O>,
  engine: ControlEngine | null,
): ControlHandle<S, O, A>;
export function createControl(
  definition: AnyDefinition,
  first: object,
  engine: ControlEngine | null,
): Control;
export function createControl(
  definition: AnyDefinition,
  first: object,
  given: ControlEngine | null,
): Control {
  const engine = given ?? createControlEngine();
  const store = createStore(definition, first);
  const options = () => optionsOf(definition, store.props());
  const now = () => ({ ...store.state(), ...options() });
  const actions = bind(
    definition,
    createChange({ definition, store, engine }, () => control),
    now,
  );
  const view = createView(actions);
  const control: Control = {
    definition,
    actions,
    state: store.state,
    options,
    own: store.own,
    subscribe: store.subscribe,
    sync: store.sync,
    attach: () => engine.add(control),
    view: (own, props) => view(store.stateFor(own, props), optionsOf(definition, props)),
  };
  return control;
}
