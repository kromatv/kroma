import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finishBuild } from './finish-build';

const ENTRY = '/assets/index-A1b2C3d4.js';
const SHELL = [
  '<!DOCTYPE html><html><head>',
  `<link rel="modulepreload" href="${ENTRY}" fetchPriority="low"/>`,
  '</head><body>',
  `<script type="module" async="" src="${ENTRY}"></script>`,
  'x'.repeat(2048),
  '</body></html>',
].join('');

let root = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kroma-finish-'));
  await mkdir(join(root, 'dist/client/fr'), { recursive: true });
  await writeFile(join(root, 'dist/client/_shell.html'), SHELL);
  await writeFile(join(root, 'dist/client/fr/index.html'), SHELL);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function finish(precompress: boolean): Promise<void> {
  const info = vi.fn();
  const builder = {
    environments: {
      client: { config: { root, build: { outDir: 'dist/client' }, logger: { info } } },
    },
  };
  const { handler } = finishBuild({ precompress }).buildApp as {
    handler: (b: unknown) => Promise<void>;
  };
  await handler.call(null, builder);
}

describe('finishBuild', () => {
  it('sorts after the prerender, on both axes', () => {
    const plugin = finishBuild({ precompress: false });

    expect(plugin.enforce).toBe('post');
    expect(plugin.buildApp).toMatchObject({ order: 'post' });
  });

  it('preloads the entry at high priority on every built page', async () => {
    await finish(false);

    for (const page of ['dist/client/_shell.html', 'dist/client/fr/index.html']) {
      expect(await readFile(join(root, page), 'utf8')).toContain(
        `<link rel="modulepreload" href="${ENTRY}" fetchPriority="high"/>`,
      );
    }
  });

  it('leaves a build with no client environment alone', async () => {
    const { handler } = finishBuild({ precompress: true }).buildApp as {
      handler: (b: unknown) => Promise<void>;
    };

    await handler.call(null, { environments: {} });

    expect(await readFile(join(root, 'dist/client/_shell.html'), 'utf8')).toBe(SHELL);
  });

  it('compresses the pages only when asked to', async () => {
    const shell = join(root, 'dist/client/_shell.html');

    await finish(false);
    expect(existsSync(`${shell}.br`)).toBe(false);

    await finish(true);
    expect(existsSync(`${shell}.br`)).toBe(true);
    expect(existsSync(`${shell}.gz`)).toBe(true);
  });
});
