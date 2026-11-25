import { actionsNow } from './control-calls';
import { type Mounted, refOf } from './mounted-controls';
import { type PropSummary, summarizeProps } from './prop-summary';
import { type Fiber, propsOf } from './react-fiber';

/** A control as a read reports it: the ref a call names it by, its kind, its
 *  state, and what a call may ask of it now. */
export type ScreenControl = {
  ref: string;
  kind: string;
  state: PropSummary;
  actions: string[];
};

/** Every mounted control by its own object, which is what the component that
 *  runs it keeps in a hook, wherever it calls `useControl`. */
export type Roster = ReadonlyMap<unknown, Mounted>;

/** The roster of a list of mounted controls. */
export const rosterOf = (mounted: readonly Mounted[]): Roster =>
  new Map(mounted.map((entry) => [entry.control, entry]));

/** What a read says of the control the component `name` runs on `fiber`. */
export function screenControl(name: string, fiber: Fiber, mounted: Mounted): ScreenControl {
  const { control } = mounted;
  return {
    ref: refOf(mounted),
    kind: control.definition.name,
    state: summarizeProps(name, propsOf(fiber), control.state()),
    actions: actionsNow(control),
  };
}
