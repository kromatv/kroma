import { z } from 'zod';

export type Verdict = { ship: true } | { ship: false; reason: string };

export interface Recorded {
  version: string;
  build: number | undefined;
}

const Version = z.string().regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
const Build = z.coerce.number().int().positive();

/** The newest run whose Candidate gate passed, asking about `ids` newest first and stopping at the first. */
export async function newestPromotable(
  ids: readonly number[],
  gate: (id: number) => Promise<string | null>,
): Promise<number | undefined> {
  for (const id of ids) {
    if ((await gate(id)) === 'success') return id;
  }
  return undefined;
}

/** What a Build & Release run wrote in its `candidate-version` artifact. A run older than the build file records no build. */
export function parseRecorded(versionFile: string, buildFile: string | undefined): Recorded {
  const version = Version.parse(versionFile.trim());
  const build = buildFile === undefined ? undefined : Build.parse(buildFile.trim());
  return { version, build };
}

/** Whether a candidate still has to reach the testers, given the highest build App Store Connect holds. */
export function verdict(build: number | undefined, uploaded: number | undefined): Verdict {
  if (build === undefined) {
    return {
      ship: false,
      reason: 'the run recorded no build number, so it predates the beta channels',
    };
  }
  if (uploaded !== undefined && build <= uploaded) {
    return {
      ship: false,
      reason: `App Store Connect already holds build ${uploaded}, at or past ${build}`,
    };
  }
  return { ship: true };
}
