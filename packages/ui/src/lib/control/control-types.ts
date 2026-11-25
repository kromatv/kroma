/** Who made a change: a person through the control, or a developer tool
 *  driving the screen. */
export type ChangeSource = 'user' | 'tool';

/** What a change callback learns beside the value, and how it refuses it. */
export type ChangeDetails<Reason extends string = string> = {
  /** The action that asked for the change, or the reason a setter was given. */
  readonly reason: Reason;
  readonly source: ChangeSource;
  readonly canceled: boolean;
  /** Keeps the value as it was, and the control reports the change as refused. */
  cancel: () => void;
};

type Named<K, Prefix extends string, Suffix extends string = ''> = K extends string
  ? `${Prefix}${Capitalize<K>}${Suffix}`
  : never;

/** What an action reads: the state and the options as they are when it runs. */
export type Now<S, O> = Readonly<S & O>;

/** The arguments each action takes after `now`, by the action's name. */
export type ActionArgs = Readonly<Record<string, readonly unknown[]>>;

/** The actions of a definition: each answers with the state keys it changes. */
export type Actions<S, O, A extends ActionArgs> = {
  readonly [K in keyof A]: (now: Now<S, O>, ...args: A[K]) => Partial<S>;
};

/** Any reason, which is what a setter may give when its control declares
 *  none. Written so an editor still completes the reasons it knows. */
export type AnyReason = string & NonNullable<unknown>;

/** Every reason a change of this control can carry: one per action, `set` for
 *  a setter called without one, and the reasons the control declared. */
export type Reasons<A, R extends string = AnyReason> = Extract<keyof A, string> | 'set' | R;

/** What a setter is told beside the value: a reason, or the details of the
 *  change it passes on, whose reason it keeps. */
export type Why<R extends string = AnyReason> = R | { readonly reason: R };

/** The three props of each state key: `value`, `defaultValue`, `onValueChange`. */
export type StateProps<S, Reason extends string = string> = {
  readonly [K in keyof S]?: S[K];
} & {
  readonly [K in keyof S as Named<K, 'default'>]?: S[K];
} & {
  readonly [K in keyof S as Named<K, 'on', 'Change'>]?: (
    next: S[K],
    details: ChangeDetails<Reason>,
  ) => void;
};

/** One setter per state key: `setValue(next, why?)`. False when nothing
 *  changed or the app refused. */
export type Setters<S, R extends string = AnyReason> = {
  readonly [K in keyof S as Named<K, 'set'>]: (next: S[K], why?: Why<R>) => boolean;
};

type Declared<K> = string extends K ? never : K;

/** The actions as a component calls them. False when nothing changed or the
 *  app refused. */
export type Bound<A extends ActionArgs> = {
  readonly [K in keyof A as Declared<K>]: (...args: A[K]) => boolean;
};

/** An entry of the state or of the options, and the prop that gives it. */
export type Slot = { readonly key: string; readonly from: string };

/** A state key starts from its `default<Key>` prop. These are its callback's
 *  name and its setter's. */
export type StateKey = Slot & { readonly change: string; readonly setter: string };

/** What a definition says about its props, whatever its types are. */
export type ControlShape = {
  readonly name: string;
  readonly state: object;
  readonly options: object;
  readonly keys: readonly StateKey[];
  readonly keyOf: ReadonlyMap<string, StateKey>;
  readonly optionKeys: readonly Slot[];
  /** The reasons its setters give, when the control declared them. */
  readonly reasons: readonly string[];
  /** Every prop name the control reads, which is what `rest` leaves out. */
  readonly owned: ReadonlySet<string>;
};

/** A kind of control: the state it holds, the options it reads, what it can
 *  do, and the reasons its setters give. */
export type ControlDefinition<
  S,
  O,
  A extends ActionArgs,
  R extends string = AnyReason,
> = ControlShape & {
  readonly state: S;
  readonly options: O;
  readonly actions: Actions<S, O, A>;
  readonly reasons: readonly R[];
};

/** The props a state shape and an options shape ask of a component. */
export type PropsOf<S, O, Reason extends string = string> = StateProps<S, Reason> & {
  readonly [K in keyof O]?: O[K];
};

/** The props a component built on a definition takes for it. */
export type ControlProps<D> =
  D extends ControlDefinition<infer S, infer O, infer A, infer R extends string>
    ? PropsOf<S, O, Reasons<A, R>>
    : never;

/** The reasons a change of a definition's control can carry, which is what
 *  `details.reason` is in the component's own `on<Key>Change`. */
export type ReasonOf<D> =
  D extends ControlDefinition<infer _S, infer _O, infer A, infer R extends string>
    ? Reasons<A, R>
    : never;

/** The state, the resolved options, the setters and the actions, in one object. */
export type ControlView<S, O, A extends ActionArgs, R extends string = AnyReason> = Readonly<S> &
  Readonly<O> &
  Setters<S, R> &
  Bound<A>;

/** What `useControl` hands a component for a definition, and what a compound's
 *  Root publishes to its parts. */
export type ControlOf<D> =
  D extends ControlDefinition<infer S, infer O, infer A, infer R extends string>
    ? ControlView<S, O, A, R>
    : never;
