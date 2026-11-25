import type { Control } from '../control';

/** One thing asked of a control: a setter or an action, and its arguments. */
export type ControlCall = { action: string; args: readonly unknown[] };

/** The keys a call would write, by name. */
export type Patch = Readonly<Record<string, unknown>>;

/** Whether the component running the control was given `disabled`. */
export const isDisabled = (control: Control): boolean =>
  Reflect.get(control.props(), 'disabled') === true;

function kindOf(value: unknown): string {
  if (value === null || value === undefined) {
    return 'nothing';
  }
  return Array.isArray(value) ? 'array' : typeof value;
}

const said = (value: unknown): string => JSON.stringify(value) ?? String(value);

/** What was thrown, quoted for a message. */
export const thrown = (error: unknown): string =>
  said(error instanceof Error ? error.message : error);

function setterPatch(control: Control, { action, args }: ControlCall): Patch | string | undefined {
  const key = control.definition.keys.find(({ setter }) => setter === action)?.key;
  if (key === undefined) {
    return undefined;
  }
  return args.length === 1 ? { [key]: args[0] } : `it takes one value, the ${key} to hold`;
}

function actionPatch(control: Control, { action, args }: ControlCall): Patch | string | undefined {
  const run = control.definition.actions[action];
  if (!run) {
    return undefined;
  }
  const most = Math.max(run.length - 1, 0);
  if (args.length > most) {
    return most === 0 ? 'it takes no argument' : `it takes at most ${most} arguments`;
  }
  try {
    return Object.fromEntries(
      Object.entries(run({ ...control.state(), ...control.options() }, ...args)),
    );
  } catch (error) {
    return `it threw ${thrown(error)}`;
  }
}

function misfit(control: Control, patch: Patch): string | undefined {
  const state = control.state();
  const key = Object.keys(patch).find(
    (name) => kindOf(state[name]) !== 'nothing' && kindOf(state[name]) !== kindOf(patch[name]),
  );
  return key === undefined
    ? undefined
    : `${key} holds a ${kindOf(state[key])}, and ${said(patch[key])} is not one`;
}

/**
 * What a call would write, without writing it, or why it cannot run. An action
 * is pure, so it is run on the state as it is, and the call is refused when a
 * key would get a value of another kind than the one it holds.
 */
export function dryRun(control: Control, call: ControlCall): Patch | string {
  const patch = setterPatch(control, call) ?? actionPatch(control, call);
  if (patch === undefined) {
    return `the ${control.definition.name} has no such action. It takes: ${Object.keys(control.actions).join(', ')}`;
  }
  return typeof patch === 'string' ? patch : (misfit(control, patch) ?? patch);
}

/** Whether a patch holds a value the control does not have yet. */
export function changes(control: Control, patch: Patch): boolean {
  const state = control.state();
  return Object.entries(patch).some(([key, next]) => !Object.is(state[key], next));
}

function offered(control: Control, action: string): boolean {
  const run = control.definition.actions[action];
  if (!run || run.length > 1) {
    return true;
  }
  const patch = dryRun(control, { action, args: [] });
  return typeof patch === 'string' || changes(control, patch);
}

/** What a call may ask of the control now: nothing while it is disabled,
 *  otherwise its setters, the actions that take arguments, and the others when
 *  they would change something. */
export function actionsNow(control: Control): string[] {
  return isDisabled(control)
    ? []
    : Object.keys(control.actions).filter((action) => offered(control, action));
}
