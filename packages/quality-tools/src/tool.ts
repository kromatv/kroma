import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { MAX_PIN_BYTES, readBounded } from './files';
import { type Layout, toolDir } from './layout';
import { TOOLS, type ToolName } from './pins';

interface Captured {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export const stampPath = (at: Layout) => join(at.tools, 'installed.txt');

/** What `quality:setup` installed from: the pins and the requirements, as one text to compare later. */
export function installStamp(at: Layout): string {
  return [at.pins, at.requirements].map((path) => readBounded(path, MAX_PIN_BYTES)).join('\n');
}

function requireInstalled(at: Layout): void {
  const stamp = stampPath(at);
  if (!existsSync(stamp) || !existsSync(at.python)) {
    throw new Error('the quality tools are not installed: run `bun run quality:setup` first');
  }
  if (readBounded(stamp, 2 * MAX_PIN_BYTES) !== installStamp(at)) {
    throw new Error('a pin or a requirement changed: run `bun run quality:setup` again');
  }
}

function invoke(at: Layout, tool: ToolName, args: readonly string[]) {
  requireInstalled(at);
  const PYTHONPATH = TOOLS.map((name) => join(toolDir(at, name), 'src')).join(':');
  return $`${at.python} -P -m ${tool} ${[...args]}`
    .cwd(at.root)
    .env({ ...process.env, PYTHONPATH })
    .nothrow();
}

/** Runs a tool from the repository root and hands back what it printed, whatever its exit code. */
export async function captureTool(
  at: Layout,
  tool: ToolName,
  args: readonly string[],
): Promise<Captured> {
  const done = await invoke(at, tool, args).quiet();
  return {
    exitCode: done.exitCode,
    stdout: done.stdout.toString(),
    stderr: done.stderr.toString(),
  };
}

/** Runs a tool from the repository root with its output on the terminal, and resolves to its exit code. */
export async function streamTool(
  at: Layout,
  tool: ToolName,
  args: readonly string[],
): Promise<number> {
  return (await invoke(at, tool, args)).exitCode;
}
