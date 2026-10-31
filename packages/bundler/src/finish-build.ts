import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { raiseEntryPreload } from './entry-preload.ts';
import { precompress } from './precompress.ts';

export interface FinishBuildOptions {
  /** Write a `.br` and a `.gz` beside the client's built assets. */
  precompress: boolean;
}

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

async function raisePage(file: string): Promise<void> {
  const html = await readFile(file, 'utf8');
  const raised = raiseEntryPreload(html);
  if (raised !== html) await writeFile(file, raised);
}

/**
 * The build's last steps, once the prerender has written the pages: every
 * page preloads its entry script at high priority, and with `precompress` every
 * compressible client asset gets its `.br` and `.gz`. Sorts before
 * `exitAfterBuild`, which ends the process.
 */
export function finishBuild(options: FinishBuildOptions): Plugin {
  return {
    name: 'kroma:finish-build',
    enforce: 'post',
    buildApp: {
      order: 'post',
      async handler(builder) {
        const client = builder.environments.client;
        if (!client) return;
        const files = await filesUnder(resolve(client.config.root, client.config.build.outDir));
        await Promise.all(files.filter((file) => file.endsWith('.html')).map(raisePage));
        if (!options.precompress) return;
        const { assets, saved } = await precompress(files);
        client.config.logger.info(
          `precompress: ${assets} assets, ${(saved / 1024).toFixed(0)} KiB saved`,
        );
      },
    },
  };
}
