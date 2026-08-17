import { z } from 'zod';

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
  message: z.string().min(1).max(2000),
  stack: z.string().max(16000),
  platform: z.string().max(256),
  capturedAt: z.number().int().nonnegative(),
  build: CrashBuild,
  device: CrashDevice.nullable(),
});
export type CrashReport = z.infer<typeof CrashReport>;
