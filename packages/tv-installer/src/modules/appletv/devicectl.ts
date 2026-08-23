import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type RunOptions, run } from '../../run';
import { CommandReport } from './schemas';
import { requireAppleTvTool } from './toolchain';

const MAX_REPORT_BYTES = 4_000_000;

const ADVICE: readonly (readonly [RegExp, string])[] = [
  [
    /specified device was not found/i,
    'CoreDevice no longer knows that set: pair it again in Xcode, Window then Devices and Simulators',
  ],
  [
    /problem communicating|network socket|connection to the device was lost|unable to connect/i,
    'the set stopped answering: wake it and check it is still on this network',
  ],
  [
    /developer mode is disabled/i,
    'Developer Mode is off on the set: turn it on under Settings, Privacy and Security, then restart it',
  ],
  [
    /applicationverificationfailed|provisioning profile|code ?signature|codesign/i,
    'the set is not in the signing profile this build was signed with: add it in Xcode and build again',
  ],
  [
    /appletvsimulator|minimumosversion|wrong platform|not supported on this device/i,
    'that .app was built for the simulator: build it against the appletvos SDK',
  ],
  [
    /developer disk image/i,
    'Xcode carries no developer disk image for that tvOS: update Xcode and try again',
  ],
];

export interface DevicectlRun {
  code: number;
  output: string;
  report: unknown;
}

/** Runs one devicectl subcommand and hands back the JSON report it was told to write. */
export async function devicectl(
  args: readonly string[],
  options: RunOptions = {},
): Promise<DevicectlRun> {
  const binary = requireAppleTvTool('devicectl');
  const path = join(tmpdir(), `kroma-devicectl-${crypto.randomUUID()}.json`);
  try {
    const { code, output } = await run([binary, ...args, '--json-output', path], options);
    return { code, output, report: await readReport(path) };
  } finally {
    await unlink(path).catch(() => {});
  }
}

export function failureText(report: unknown): string | null {
  const parsed = CommandReport.safeParse(report);
  if (!parsed.success) return null;
  return parsed.data.error?.userInfo?.NSLocalizedDescription?.string ?? null;
}

export function devicectlAdvice(message: string): string {
  for (const [pattern, advice] of ADVICE) if (pattern.test(message)) return advice;
  return `devicectl failed: ${message}`;
}

async function readReport(path: string): Promise<unknown> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  if (file.size > MAX_REPORT_BYTES) {
    throw new Error(
      `devicectl wrote a ${file.size} byte report, past the ${MAX_REPORT_BYTES} read`,
    );
  }
  try {
    return JSON.parse(await file.text());
  } catch {
    return null;
  }
}
