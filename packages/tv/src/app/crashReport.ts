import type { CrashReport } from '@kroma/core';
import { tvIdentity } from '#tv/app/apiClient';
import { buildInfo } from '#tv/app/clientBuild';

const MESSAGE_FALLBACK = 'Unknown error';

/** Assemble a [`CrashReport`] from a caught error, reusing the client's build
 * metadata and this device's hardware identity. Carries the stack, the React
 * component stack, and the build/device fields, and nothing that names the user. */
export function buildCrashReport(
  error: unknown,
  componentStack: string | null | undefined,
  platform: string,
  capturedAt: number,
): CrashReport {
  const err = error instanceof Error ? error : new Error(String(error));
  const build = buildInfo();
  const identity = tvIdentity();
  const stack = [err.stack ?? err.message, componentStack].filter(Boolean).join('\n\n');
  return {
    message: err.message || MESSAGE_FALLBACK,
    stack,
    platform,
    capturedAt,
    build: { version: build.version, commit: build.commit },
    device: identity ? { model: identity.model, os: identity.os } : null,
  };
}
