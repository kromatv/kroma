import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { devStore } from './dev-store';

const made: string[] = [];

function checkout(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'lingua-dev-'));
  made.push(dir);
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of made.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('devStore', () => {
  it('reads the project of the checkout it runs in, from a folder below the root', async () => {
    const root = checkout({
      'lingua.json': JSON.stringify({ projects: [{ path: 'loc' }] }),
      'loc/i18n.json': '{ "source": "en" }',
      'loc/en/nav.json': '{ "nav.home": "Home" }',
      'src/app/.keep': '',
    });
    vi.spyOn(process, 'cwd').mockReturnValue(join(root, 'src/app'));

    const store = await devStore();

    expect((await store.files('kromatv/kroma')).map((f) => f.path).sort()).toEqual(['loc/en/nav.json', 'loc/i18n.json']);
  });

  it('says why a checkout’s lingua.json cannot be read', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(checkout({ 'lingua.json': '{}' }));

    const store = await devStore();

    expect((await store.project('kromatv/kroma'))?.configError).toMatch(/^lingua\.json/);
  });

  it('holds nothing for a project folder that is not there', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(checkout({ 'lingua.json': JSON.stringify({ projects: [{ path: 'gone' }] }) }));

    const store = await devStore();

    expect(await store.files('kromatv/kroma')).toEqual([]);
  });

  it('holds no project outside a checkout', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(checkout({}));

    expect(await (await devStore()).projects()).toEqual([]);
  });
});
