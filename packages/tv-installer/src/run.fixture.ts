import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

const KILLED = 137;

type Spawned = Pick<
  Bun.Subprocess<'ignore', 'pipe', 'pipe'>,
  'stdout' | 'stderr' | 'exited' | 'kill'
>;

export const nodeSpawn = (command: readonly string[], options: { cwd?: string }): Spawned => {
  const [file, ...args] = command;
  const child = spawn(String(file), args, { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  return {
    stdout: Readable.toWeb(child.stdout),
    stderr: Readable.toWeb(child.stderr),
    exited: new Promise((resolve) => child.on('close', (code) => resolve(code ?? KILLED))),
    kill: (signal) => child.kill(signal),
  };
};
