import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { LogLine } from '../run';

export interface Tool {
  id: string;
  label: string;
  binary: string;
  source: string;
  candidates?(): readonly string[];
  install?(log: LogLine): Promise<void>;
}

export const KROMA_TOOLS = join(homedir(), '.kroma', 'tools');

export function locate(tool: Tool): string | null {
  const onPath = Bun.which(tool.binary);
  if (onPath) return onPath;
  return (tool.candidates?.() ?? []).find((path) => existsSync(path)) ?? null;
}

export function requireTool(tool: Tool): string {
  const path = locate(tool);
  if (!path) throw new Error(`${tool.label} is missing: install it from ${tool.source}`);
  return path;
}
