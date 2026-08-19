import { execFileSync } from 'node:child_process';

export type Exec = (cmd: string, args: string[]) => string;

const realExec: Exec = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' });

// Repo-relative paths changed in a range (e.g. `v0.1.38..HEAD`). Injectable exec
// so the caller is testable and a host can feed a canned diff.
export function changedFiles(range: string, exec: Exec = realExec): string[] {
  return exec('git', ['diff', '--name-only', range])
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
