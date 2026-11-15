import { join } from 'node:path';
import type { ToolName } from './pins';

export interface Layout {
  root: string;
  pins: string;
  requirements: string;
  tools: string;
  python: string;
  metrics: string;
  mergedLcov: string;
}

/** Where the toolchain keeps its clones, its venv, its reports and the one lcov crapper reads. */
export function layout(root: string): Layout {
  const tools = join(root, 'target/quality-tools');
  return {
    root,
    pins: join(root, 'packages/quality-tools/pins.txt'),
    requirements: join(root, 'packages/quality-tools/requirements.txt'),
    tools,
    python: join(tools, 'venv/bin/python'),
    metrics: join(root, '.metrics'),
    mergedLcov: join(root, 'target/coverage/quality/lcov.info'),
  };
}

export const toolDir = (at: Layout, tool: ToolName) => join(at.tools, tool);
