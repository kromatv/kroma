import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { llmsPlugin } from './llms';

interface Response {
  status: 'served' | 'passed' | 'failed';
  headers: Record<string, string>;
  body?: string;
  error?: unknown;
}

type Middleware = (
  req: { url?: string },
  res: { setHeader: (name: string, value: string) => void; end: (body: string) => void },
  next: (error?: unknown) => void,
) => void;

let repo = '';
let root = '';

async function write(path: string, content: string) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content);
}

function messages(sectionStart: string, summary: string) {
  return JSON.stringify({ site_description: summary, docs_section_start: sectionStart });
}

function resolved(at: string): Plugin {
  const plugin = llmsPlugin();
  if (typeof plugin.configResolved !== 'function')
    throw new Error('the plugin lost configResolved');
  plugin.configResolved.call({} as never, { root: at } as never);
  return plugin;
}

async function emitted(plugin: Plugin, environment: string): Promise<Map<string, string>> {
  if (typeof plugin.generateBundle !== 'function')
    throw new Error('the plugin lost generateBundle');
  const files = new Map<string, string>();
  const emitFile = (file: { fileName: string; source: string }) => {
    files.set(file.fileName, file.source);
  };
  await plugin.generateBundle.call(
    { environment: { name: environment }, emitFile } as never,
    {} as never,
    {} as never,
    false,
  );
  return files;
}

function middlewareOf(plugin: Plugin): Middleware {
  if (typeof plugin.configureServer !== 'function')
    throw new Error('the plugin lost configureServer');
  let found: Middleware | undefined;
  const use = (fn: Middleware) => {
    found = fn;
  };
  void plugin.configureServer.call({} as never, { middlewares: { use } } as never);
  if (!found) throw new Error('the plugin mounted no middleware');
  return found;
}

function request(middleware: Middleware, url?: string): Promise<Response> {
  return new Promise((done) => {
    const headers: Record<string, string> = {};
    middleware(
      { url },
      {
        setHeader: (name, value) => {
          headers[name] = value;
        },
        end: (body) => done({ status: 'served', headers, body }),
      },
      (error) => done({ status: error ? 'failed' : 'passed', headers, error }),
    );
  });
}

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'kroma-llms-'));
  root = join(repo, 'apps/www');
  await write(
    join(repo, 'docs/setup/README.md'),
    '# Set up KROMA\n\nStart with [Docker](docker.md).',
  );
  await write(join(repo, 'docs/setup/docker.md'), '# Install KROMA with Docker\n\nThe server.');
  await write(join(repo, 'docs/setup/draft-notes.md'), '# Draft\n\nNot a guide.');
  await write(join(repo, 'docs/setup/notes.txt'), 'Not Markdown.');
  await write(
    join(root, 'content/docs/docker.fr.md'),
    '# Installer KROMA avec Docker\n\nLe serveur.',
  );
  await write(join(root, 'messages/en.json'), messages('Get started', 'A media server.'));
  await write(join(root, 'messages/fr.json'), messages('Bien démarrer', 'Un serveur.'));
});

afterAll(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe('llmsPlugin', () => {
  it('emits every guide and both indexes into the client build', async () => {
    const files = await emitted(resolved(root), 'client');

    expect([...files.keys()].sort()).toEqual([
      'docs.md',
      'docs/docker.md',
      'fr/docs/docker.md',
      'fr/llms.txt',
      'llms.txt',
    ]);
    expect(files.get('docs.md')).toContain('[Docker](https://kroma.tv/docs/docker.md)');
    expect(files.get('fr/llms.txt')).toContain('# KROMA\n\n> Un serveur.\n\n## Bien démarrer');
  });

  it('emits nothing into the server build', async () => {
    expect((await emitted(resolved(root), 'ssr')).size).toBe(0);
  });

  it('serves a guide as Markdown in dev, whatever the query', async () => {
    const response = await request(middlewareOf(resolved(root)), '/fr/docs/docker.md?import');

    expect(response.status).toBe('served');
    expect(response.headers['content-type']).toBe('text/markdown; charset=utf-8');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.body).toContain('# Installer KROMA avec Docker');
  });

  it('serves the index as plain text in dev', async () => {
    const response = await request(middlewareOf(resolved(root)), '/llms.txt');

    expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(response.body).toContain(
      '- [Install KROMA with Docker](https://kroma.tv/docs/docker.md)',
    );
  });

  it('passes on a path that is not a guide', async () => {
    const middleware = middlewareOf(resolved(root));

    expect((await request(middleware, '/docs/docker')).status).toBe('passed');
    expect((await request(middleware, '/docs/draft-notes.md')).status).toBe('passed');
    expect((await request(middleware, '/README.md')).status).toBe('passed');
    expect((await request(middleware)).status).toBe('passed');
  });

  it('fails the build on a catalog without the site description', async () => {
    const bare = join(repo, 'bare/www');
    await write(join(bare, 'messages/en.json'), JSON.stringify({ docs_section_start: 'Start' }));
    await write(join(bare, 'messages/fr.json'), messages('Bien démarrer', 'Un serveur.'));
    await mkdir(join(bare, 'content/docs'), { recursive: true });
    await mkdir(join(repo, 'docs/setup'), { recursive: true });

    await expect(emitted(resolved(bare), 'client')).rejects.toThrow(/site_description/);
  });

  it('hands a read error to the next middleware', async () => {
    const response = await request(middlewareOf(resolved(join(repo, 'missing/www'))), '/llms.txt');

    expect(response.status).toBe('failed');
    expect(response.error).toBeInstanceOf(Error);
  });
});
