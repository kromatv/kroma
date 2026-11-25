import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { createControl } from './control';
import { useControlEngine } from './control-context';
import { restOf } from './control-props';
import type { ActionArgs, ControlDefinition, ControlView, PropsOf, Reasons } from './control-types';
import type { AnyDefinition } from './define-control';

/**
 * Runs one control of a definition for a component, from the component's own
 * props. It answers with the control, which is the state, the resolved options,
 * the setters and the actions, and with the props the control did not read.
 *
 * ```tsx
 * function Counter(props: CounterProps) {
 *   const [{ value, increment }, rest] = useControl(counter, props);
 *   return <Button {...rest} onPress={increment}>{value}</Button>;
 * }
 * ```
 *
 * A key whose prop is present at mount is the app's: the control asks through
 * `on<Key>Change(next, details)` and waits for the prop to move. A key without
 * one runs itself from `default<Key>`. The control joins the engine of the
 * nearest `KitProvider` while it is mounted.
 */
export function useControl<
  S extends object,
  O extends object,
  A extends ActionArgs,
  R extends string,
  P extends PropsOf<S, O, Reasons<A, R>>,
>(
  definition: ControlDefinition<S, O, A, R>,
  props: P,
): readonly [control: ControlView<S, O, A, R>, rest: Omit<P, keyof PropsOf<S, O>>];
export function useControl(definition: AnyDefinition, props: object): readonly [object, object] {
  const engine = useControlEngine();
  const [control] = useState(() => createControl(definition, props, engine));
  useLayoutEffect(() => control.attach(), [control]);
  useLayoutEffect(() => {
    control.sync(props);
  });
  const own = useSyncExternalStore(control.subscribe, control.own, control.own);
  return [control.view(own, props), restOf(definition, props)];
}
