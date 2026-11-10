import { existsSync } from 'node:fs';
import { which } from './which';

export interface Tool {
  id: string;
  label: string;
  binary: string;
  source: string;
  candidates?(): readonly string[];
}

export function locate(tool: Tool): string | null {
  const onPath = which(tool.binary);
  if (onPath) return onPath;
  return (tool.candidates?.() ?? []).find((path) => existsSync(path)) ?? null;
}

export function requireTool(tool: Tool): string {
  const path = locate(tool);
  if (!path) throw new Error(`${tool.label} is missing: install it from ${tool.source}`);
  return path;
}
