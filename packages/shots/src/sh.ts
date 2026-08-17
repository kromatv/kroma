import { spawnSync } from 'node:child_process';

interface RunOptions {
  /** Return what the command managed to print instead of throwing on a non-zero
   * exit. For the probes whose failure IS the answer (is this app installed?). */
  allowFailure?: boolean;
}

/** Run a command and return its stdout. Arguments are passed as a list, never
 * through a shell, so a slug or device name can never become a command. */
export function run(command: string, args: string[]): string;
export function run(command: string, args: string[], as: 'text', options?: RunOptions): string;
export function run(command: string, args: string[], as: 'buffer', options?: RunOptions): Buffer;
export function run(
  command: string,
  args: string[],
  as: 'text' | 'buffer' = 'text',
  options: RunOptions = {},
): string | Buffer {
  const result = spawnSync(command, args, {
    encoding: as === 'buffer' ? 'buffer' : 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0 && !options.allowFailure) {
    const stderr = String(result.stderr ?? '').trim();
    const detail = stderr ? `\n${stderr}` : '';
    throw new Error(`${command} ${args.join(' ')} exited ${result.status}${detail}`);
  }
  return as === 'buffer' ? (result.stdout as Buffer) : String(result.stdout ?? '');
}
