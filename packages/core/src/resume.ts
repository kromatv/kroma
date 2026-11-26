import type { ProgressEntry } from '@kromatv/client/media';

const LEGACY_FLOOR_MS = 15_000;
const LEGACY_END = 0.95;

function legacyResumes(entry: ProgressEntry, runtimeMs: number): boolean {
  const duration = entry.durationMs ?? runtimeMs;
  return (
    entry.positionMs > LEGACY_FLOOR_MS && (!duration || entry.positionMs < duration * LEGACY_END)
  );
}

/** Where playback of a title starts, in seconds: its saved position when the
 * server says it resumes, else the beginning. A server too old to say is
 * judged by the rule every player used to apply, against `runtimeMs` when the
 * entry carries no duration. */
export function resumeSeconds(entry: ProgressEntry | null | undefined, runtimeMs = 0): number {
  if (!entry) {
    return 0;
  }
  const resumes = entry.resumable ?? legacyResumes(entry, runtimeMs);
  return resumes ? entry.positionMs / 1000 : 0;
}
