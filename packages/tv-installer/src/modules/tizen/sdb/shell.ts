import type { SdbConnection } from './connection';

const DEFAULT_LIMIT = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 300_000;

export interface ShellOptions {
  limit?: number;
  timeoutMs?: number;
}

/** Runs one command and returns what it printed, capped at `limit` bytes. */
export async function shell(
  connection: SdbConnection,
  command: string,
  { limit = DEFAULT_LIMIT, timeoutMs = DEFAULT_TIMEOUT_MS }: ShellOptions = {},
): Promise<string> {
  const stream = await connection.openStream(`shell:${command}`);
  try {
    const output = await stream.drain({ limit, timeoutMs });
    return output.toString('utf8');
  } finally {
    stream.close();
  }
}
