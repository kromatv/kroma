import { z } from 'zod';

/** One screen of the guided setup, in the order the owner meets them. */
export const SetupStep = z.enum([
  'language',
  'start',
  'owner',
  'import',
  'media',
  'modules',
  'people',
  'privacy',
  'done',
]);
export type SetupStep = z.infer<typeof SetupStep>;

/** How the setup began: on an empty server, or by bringing another one over. */
export const SetupStart = z.enum(['fresh', 'bring']);
export type SetupStart = z.infer<typeof SetupStart>;

/** A step that can be a line of the checklist an ended setup leaves. */
export const SetupLine = z.enum(['import', 'media', 'modules', 'people', 'privacy']);
export type SetupLine = z.infer<typeof SetupLine>;

/** A step the owner confirms, because its answer leaves nothing else behind. */
export const SetupConfirmed = z.enum(['modules', 'privacy']);
export type SetupConfirmed = z.infer<typeof SetupConfirmed>;

function knownLines(lines: readonly unknown[]): SetupLine[] {
  return lines.flatMap((line) => {
    const read = SetupLine.safeParse(line);
    return read.success ? [read.data] : [];
  });
}

/** Where the owner's setup stands. `step` is where they stopped, `reached` the
 * furthest step they have been to, and `checklist` the lines an ended setup
 * still holds, in order. A line this client does not know is left out. */
export const SetupState = z.object({
  start: SetupStart,
  step: SetupStep,
  reached: SetupStep,
  ended: z.boolean(),
  checklist: z.array(z.unknown()).transform(knownLines),
});
export type SetupState = z.infer<typeof SetupState>;

/** `GET /api/admin/setup`. No setup for anyone it does not lead, and on a
 * server whose owner came before it. */
export const SetupAnswer = z.object({ setup: SetupState.nullable() });
export type SetupAnswer = z.infer<typeof SetupAnswer>;

/** The step the owner is on, and how their setup began. */
export interface SetupAdvance {
  step: SetupStep;
  start: SetupStart;
}
