import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openProject } from '../project';
import { catalogsOf, i18nCommand, writeMessageTypes } from './i18n';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const FILES = {
  'locales/en.json': { 'page.title': 'Notes', 'page.hello': 'Hello {answer}' },
  'locales/fr.json': { 'page.title': 'Notes' },
};

const FOLDERS = {
  'locales/en/page.json': { 'page.title': 'Notes' },
  'locales/en/page/greeting.json': { 'page.hello': 'Hello {answer}' },
  'locales/fr/page.json': { 'page.title': 'Notes' },
};

function moduleAt(dependency: string, locales: Record<string, object> = FILES): string {
  const dir = mkdtempSync(join(tmpdir(), 'kroma-cli-i18n-'));
  dirs.push(dir);
  const write = (path: string, content: unknown) => {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), typeof content === 'string' ? content : JSON.stringify(content));
  };
  write('module.json', { schemaVersion: 3, id: 'tv.kroma.notes', name: 'Notes', version: '0.1.0' });
  write('package.json', { name: 'notes', dependencies: { [dependency]: '*' } });
  for (const [path, content] of Object.entries(locales)) {
    write(path, content);
  }
  write('ui/src/module.tsx', 'export default {};');
  return dir;
}

async function run(dir: string, ...argv: string[]): Promise<{ code: number; text: string }> {
  const lines: string[] = [];
  const code = await i18nCommand({ argv, cwd: dir, print: (text) => lines.push(text) });
  return { code, text: lines.join('\n') };
}

describe('kroma i18n', () => {
  it('reports the languages a module ships against its English', async () => {
    const { text } = await run(moduleAt('@kromatv/sdk'));

    expect(text).toMatch(/en +source +2 +0 +0 +0 +0 +100%/);
    expect(text).toMatch(/fr +beta +1 +0 +0 +0 +1 +50\.0%/);
  });

  it('names itself in the hint a failing check gives', async () => {
    const { code, text } = await run(moduleAt('@kromatv/sdk'), 'check');

    expect(code).toBe(1);
    expect(text).toContain('run `kroma i18n sync`');
  });

  it('starts a language as an empty catalog', async () => {
    const dir = moduleAt('@kromatv/sdk');

    await run(dir, 'add', 'de');

    expect(readFileSync(join(dir, 'locales/de.json'), 'utf8')).toBe('{}\n');
  });
});

describe('kroma i18n over a module that keeps one folder per language', () => {
  it('reports its languages the same, whatever files the messages are split into', async () => {
    const { text } = await run(moduleAt('@kromatv/sdk', FOLDERS));

    expect(text).toMatch(/en +source +2 +0 +0 +0 +0 +100%/);
    expect(text).toMatch(/fr +beta +1 +0 +0 +0 +1 +50\.0%/);
  });

  it('holds once the lock is written inside the folder of the language', async () => {
    const dir = moduleAt('@kromatv/sdk', FOLDERS);
    await run(dir, 'sync');

    const { code, text } = await run(dir, 'check');

    expect([code, text]).toEqual([0, 'The catalogs hold.']);
    expect(existsSync(join(dir, 'locales/fr/i18n.lock'))).toBe(true);
  });

  it('starts a language as one empty file in its own folder', async () => {
    const dir = moduleAt('@kromatv/sdk', FOLDERS);

    const { text } = await run(dir, 'add', 'de');

    expect(readFileSync(join(dir, 'locales/de/page.json'), 'utf8')).toBe('{}\n');
    expect(text).not.toContain('i18n.json');
  });

  it('declares its keys beside its front end, and nothing beside its locales', async () => {
    const dir = moduleAt('@kromatv/sdk', FOLDERS);

    await run(dir, 'types');

    expect(readFileSync(join(dir, 'ui/src/messages.d.ts'), 'utf8')).toContain(
      "'page.hello': { answer: V };",
    );
    expect(existsSync(join(dir, 'locales/messages.d.ts'))).toBe(false);
  });
});

describe('writeMessageTypes', () => {
  it('declares the keys of the module against the published SDK', () => {
    const dir = moduleAt('@kromatv/sdk');

    const written = writeMessageTypes([openProject(dir)]);

    const text = readFileSync(join(dir, 'ui/src/messages.d.ts'), 'utf8');
    expect(written).toEqual([join(dir, 'ui/src/messages.d.ts')]);
    expect(text).toContain("declare module '@kromatv/sdk' {");
    expect(text).toContain("'page.hello': { answer: V };");
  });

  it('declares them against the workspace package for a module of this repository', () => {
    const dir = moduleAt('@kromatv/module-sdk');

    writeMessageTypes([openProject(dir)]);

    expect(readFileSync(join(dir, 'ui/src/messages.d.ts'), 'utf8')).toContain(
      "declare module '@kromatv/module-sdk' {",
    );
  });

  it('writes nothing for a module with no front end', () => {
    const dir = moduleAt('@kromatv/sdk');
    rmSync(join(dir, 'ui'), { recursive: true });

    expect(writeMessageTypes([openProject(dir)])).toEqual([]);
    expect(existsSync(join(dir, 'ui'))).toBe(false);
  });
});

describe('catalogsOf', () => {
  it('ships every language the module has a file for', () => {
    const set = catalogsOf(openProject(moduleAt('@kromatv/sdk')));

    expect(set.project).toEqual({
      source: 'en',
      locales: { en: { stage: 'beta' }, fr: { stage: 'beta' } },
    });
  });

  it('ships every language the module has a folder for', () => {
    const set = catalogsOf(openProject(moduleAt('@kromatv/sdk', FOLDERS)));

    expect(set.layout).toBe('folder');
    expect(set.project.locales).toEqual({ en: { stage: 'beta' }, fr: { stage: 'beta' } });
  });
});
