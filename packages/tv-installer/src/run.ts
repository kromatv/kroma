import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';

export type LogLine = (line: string) => void;

const KILLED = 137;

export interface RunOptions {
  log?: LogLine;
  cwd?: string;
  timeoutMs?: number;
}

export interface RunResult {
  code: number;
  output: string;
}

/** Runs a command, streaming both its streams to `log` line by line. */
export async function run(
  command: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const [file, ...args] = command;
  if (!file) throw new Error('run() needs a command');

  const child = spawn(file, args, { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? KILLED));
  });
  const killer = options.timeoutMs
    ? setTimeout(() => child.kill('SIGKILL'), options.timeoutMs)
    : undefined;

  const collected: string[] = [];
  const drain = async (stream: Readable) => {
    for await (const line of lines(stream)) {
      collected.push(line);
      options.log?.(line);
    }
  };

  try {
    const [code] = await Promise.all([exited, drain(child.stdout), drain(child.stderr)]);
    return { code, output: collected.join('\n') };
  } finally {
    clearTimeout(killer);
  }
}

/** As `run`, but a non-zero exit is an error carrying what the command said. */
export async function runOk(command: readonly string[], options: RunOptions = {}): Promise<string> {
  const { code, output } = await run(command, options);
  if (code !== 0) {
    const tail = output.split('\n').filter(Boolean).slice(-4).join(' / ');
    const said = tail ? `: ${tail}` : '';
    throw new Error(`${command[0]} exited ${code}${said}`);
  }
  return output;
}

async function* lines(stream: Readable): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let carry = '';
  for await (const chunk of stream) {
    carry += decoder.decode(chunk as Uint8Array, { stream: true });
    const parts = carry.split('\n');
    carry = parts.pop() ?? '';
    for (const part of parts) yield part.trimEnd();
  }
  if (carry.trim()) yield carry.trimEnd();
}
