export type LogLine = (line: string) => void;

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

  const child = Bun.spawn([file, ...args], {
    cwd: options.cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const killer = options.timeoutMs
    ? setTimeout(() => child.kill('SIGKILL'), options.timeoutMs)
    : undefined;

  const collected: string[] = [];
  const drain = async (stream: ReadableStream<Uint8Array>) => {
    for await (const line of lines(stream)) {
      collected.push(line);
      options.log?.(line);
    }
  };

  try {
    await Promise.all([drain(child.stdout), drain(child.stderr)]);
    return { code: await child.exited, output: collected.join('\n') };
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

async function* lines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let carry = '';
  for await (const chunk of stream) {
    carry += decoder.decode(chunk, { stream: true });
    const parts = carry.split('\n');
    carry = parts.pop() ?? '';
    for (const part of parts) yield part.trimEnd();
  }
  if (carry.trim()) yield carry.trimEnd();
}
