import { z } from 'zod';
import { type ControlCall, changes, dryRun, isDisabled, thrown } from './control-calls';
import { type Mounted, mountedControls, refOf } from './mounted-controls';
import { type ControlRow, snapshot } from './screen-snapshot';

/** The most steps one call runs. */
export const MAX_STEPS = 50;

const SETTLE_MS = 16;

const stepSchema = z.object({
  ref: z
    .string()
    .nonempty()
    .max(40)
    .describe(
      'The control, by its ref in read_screen or list_controls: c4, or 2:c4 in a second kit tree.',
    ),
  action: z
    .string()
    .nonempty()
    .max(80)
    .describe(
      'One of the actions that control lists now: a setter (setChecked) or an action (toggle).',
    ),
  args: z
    .array(z.unknown())
    .max(8)
    .optional()
    .describe('What the action takes. A setter takes one value, the one to hold.'),
});

/** What `act` takes: the steps of a call, run in order. */
export const callSchema = z.object({
  steps: z
    .array(stepSchema)
    .min(1)
    .max(MAX_STEPS)
    .describe('Run in order. The call stops at the first step that cannot run.'),
});

/** One thing to ask of one control: its `ref` from a read, a setter or an
 *  action the read lists for it, and the arguments that takes. */
export type ActStep = z.infer<typeof stepSchema>;

/** What a step that ran did: `changed` when the control took the value or
 *  asked the app that owns it to, `unchanged` when it already held it,
 *  `canceled` when the app's callback refused. */
export type StepOutcome = 'changed' | 'unchanged' | 'canceled';

/** A step that ran, by its place in the call. */
export type StepReport = { step: number; ref: string; action: string; outcome: StepOutcome };

/** What a call did: the steps that ran, and the controls they named as they
 *  read afterwards. The steps before a failed one stay done, and `error.step`
 *  is absent when the call itself was not `{ steps: [{ ref, action, args }] }`. */
export type ActReport = {
  ok: boolean;
  steps: StepReport[];
  controls: ControlRow[];
  error?: { step?: number; message: string };
};

type Ran = { outcome: StepOutcome } | { refused: string };

const SHAPE = '{ "steps": [{ "ref": "c4", "action": "setChecked", "args": [true] }] }';

function malformed(error: z.ZodError): string {
  const [issue] = error.issues;
  const where = issue ? `${issue.path.join('.')}: ${issue.message}` : 'not an object';
  return `A call is ${SHAPE}. ${where}.`;
}

function runCall({ control, engine }: Mounted, call: ControlCall): Ran {
  if (isDisabled(control)) {
    return { refused: `the ${control.definition.name} is disabled` };
  }
  const patch = dryRun(control, call);
  if (typeof patch === 'string') {
    return { refused: patch };
  }
  const action = control.actions[call.action];
  if (!action || !changes(control, patch)) {
    return { outcome: 'unchanged' };
  }
  try {
    const took = engine.as('tool', () => action(...call.args));
    return { outcome: took ? 'changed' : 'canceled' };
  } catch (error) {
    return { refused: `the app threw ${thrown(error)}` };
  }
}

function runStep(step: ActStep): Ran {
  const mounted = mountedControls().find((entry) => refOf(entry) === step.ref);
  if (!mounted) {
    return {
      refused: `${step.ref}: no such control is mounted. Read the screen again for its refs.`,
    };
  }
  const ran = runCall(mounted, { action: step.action, args: step.args ?? [] });
  return 'refused' in ran ? { refused: `${step.ref}.${step.action}: ${ran.refused}.` } : ran;
}

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
}

type Run = { steps: readonly ActStep[]; done: StepReport[] };

async function runFrom(run: Run, at: number): Promise<ActReport['error']> {
  const step = run.steps[at];
  if (!step) {
    return undefined;
  }
  const ran = runStep(step);
  if ('refused' in ran) {
    return { step: at, message: ran.refused };
  }
  run.done.push({ step: at, ref: step.ref, action: step.action, outcome: ran.outcome });
  await settled();
  return runFrom(run, at + 1);
}

/**
 * Runs the steps of a call in order and stops at the first that cannot run.
 * A step calls a setter or an action of a mounted control, the same function
 * the component calls on a press, signed as a tool's so the app's callback can
 * tell. It is tried without writing first: a disabled control, an action the
 * control does not have and a value of another kind than the key holds are
 * refused with a message that says what to send instead. The next step waits
 * for React to commit what this one changed. Nothing is undone when a step
 * fails.
 */
export async function act(input: unknown): Promise<ActReport> {
  const call = callSchema.safeParse(input);
  if (!call.success) {
    return { ok: false, steps: [], controls: [], error: { message: malformed(call.error) } };
  }
  const steps: StepReport[] = [];
  const error = await runFrom({ steps: call.data.steps, done: steps }, 0);
  const named = new Set(steps.map((step) => step.ref));
  const controls = snapshot().filter((control) => named.has(control.ref));
  return error ? { ok: false, steps, controls, error } : { ok: true, steps, controls };
}
