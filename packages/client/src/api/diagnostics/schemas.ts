import { z } from 'zod';
import { brandedId, DeviceId } from '../../core/ids';

export const CrashBuild = z.object({
  version: z.string().max(256),
  commit: z.string().max(256).nullable(),
});
export type CrashBuild = z.infer<typeof CrashBuild>;

export const CrashDevice = z.object({
  model: z.string().max(256),
  os: z.string().max(256),
});
export type CrashDevice = z.infer<typeof CrashDevice>;

/** An uncaught client crash, as posted to `/api/diagnostics/crash`. Minimal by
 * design: a stack and message plus the build/device metadata needed to place
 * the crash, and nothing that identifies the user. */
export const CrashReport = z.object({
  message: z.string().nonempty().max(2000),
  stack: z.string().max(16000),
  platform: z.string().max(256),
  capturedAt: z.number().int().nonnegative(),
  build: CrashBuild,
  device: CrashDevice.nullable(),
});
export type CrashReport = z.infer<typeof CrashReport>;

/** The most rows a screen answer carries; past it the answer says `truncated`. */
export const SCREEN_MAX_ROWS = 2000;

/** One request an admin has open against a screen. */
export const ScreenRequestId = brandedId('ScreenRequestId');
export type ScreenRequestId = z.infer<typeof ScreenRequestId>;

/** Where a component sits, in the device's viewport pixels. */
export const ScreenBox = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type ScreenBox = z.infer<typeof ScreenBox>;

/** One mounted kit component, `depth` levels under the top of the screen, with
 * its public name, a bounded summary of its props, and its box. */
export const ScreenRow = z.object({
  depth: z.number().int().nonnegative(),
  name: z.string().nonempty().max(128),
  props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  box: ScreenBox.nullable(),
});
export type ScreenRow = z.infer<typeof ScreenRow>;

/** What a screen shows: its kit components as rows in document order, how many
 * fibers the reader walked, and whether the rows were cut short. */
export const Screen = z.object({
  fibers: z.number().int().nonnegative(),
  truncated: z.boolean(),
  rows: z.array(ScreenRow).max(SCREEN_MAX_ROWS),
});
export type Screen = z.infer<typeof Screen>;

/** A live screen on the caller's own account, as the roster lists it. */
export const ScreenDevice = z.object({ id: DeviceId, name: z.string(), platform: z.string() });
export type ScreenDevice = z.infer<typeof ScreenDevice>;

/** The body of the screen roster route. */
export const ScreenRoster = z.object({ screens: z.array(ScreenDevice) });

/** The frame the server pushes down a screen's event socket when an admin asks it. */
export const ScreenRequest = z.object({
  type: z.literal('screen.request'),
  screenId: DeviceId,
  requestId: ScreenRequestId,
});
export type ScreenRequest = z.infer<typeof ScreenRequest>;

/** What a screen says up its event socket: that it can answer, and the answer. */
export const ScreenClientMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('screen.hello'),
    screenId: DeviceId,
    name: z.string(),
    platform: z.string(),
  }),
  z.object({ type: z.literal('screen.reply'), requestId: ScreenRequestId, screen: Screen }),
]);
export type ScreenClientMessage = z.infer<typeof ScreenClientMessage>;
