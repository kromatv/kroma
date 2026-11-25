import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { run } from './run.ts';
import type { CatalogSet } from './set.ts';
import { moduleSet } from './workspace.ts';

const MANIFEST = `{
  "schemaVersion": 3,
  "id": "tv.acme.notes",
  "version": "0.3.4",
  "permissions": { "net": ["api.acme.tv"] }
}
`;

const made: string[] = [];

afterEach(() => {
  for (const dir of made.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function catalog(messages: Record<string, string>): string {
  return `${JSON.stringify(messages, null, 2)}\n`;
}

function project(manifest: string | null = MANIFEST): string {
  const dir = mkdtempSync(join(tmpdir(), 'kroma-i18n-bump-'));
  made.push(dir);
  mkdirSync(join(dir, 'locales'));
  if (manifest !== null) {
    writeFileSync(join(dir, 'module.json'), manifest);
  }
  writeFileSync(join(dir, 'locales', 'en.json'), catalog({ 'page.title': 'Notes' }));
  writeFileSync(
    join(dir, 'answers.json'),
    JSON.stringify({ 'tv.acme.notes': { 'page.title': 'Notes' } }),
  );
  return dir;
}

function moduleIn(dir: string): CatalogSet {
  return moduleSet('tv.acme.notes', dir, { source: 'en', locales: { fr: { stage: 'beta' } } });
}

async function runIn(dir: string, argv: string[], base: string | null = MANIFEST) {
  const lines: string[] = [];
  await run(argv, {
    sets: [moduleIn(dir)],
    root: dir,
    bin: 'kroma i18n',
    print: (text) => lines.push(text),
    atBase: () => base,
  });
  return { lines, manifest: readFileSync(join(dir, 'module.json'), 'utf8') };
}

describe('the version of a module whose messages a command wrote', () => {
  it('moves by one patch, the rest of its manifest as it was written', async () => {
    const dir = project();

    const { lines, manifest } = await runIn(dir, ['fill', 'fr', join(dir, 'answers.json')]);

    expect(manifest).toBe(MANIFEST.replace('0.3.4', '0.3.5'));
    expect(lines).toContain('tv.acme.notes 0.3.4 -> 0.3.5');
  });

  it('moves once per branch, so a version already past the base stays', async () => {
    const dir = project();

    const { lines, manifest } = await runIn(
      dir,
      ['fill', 'fr', join(dir, 'answers.json')],
      MANIFEST.replace('0.3.4', '0.3.3'),
    );

    expect(manifest).toBe(MANIFEST);
    expect(lines.join('\n')).not.toContain('->');
  });

  it('stays where there is no base to compare with', async () => {
    const dir = project();

    const { manifest } = await runIn(dir, ['fill', 'fr', join(dir, 'answers.json')], null);

    expect(manifest).toBe(MANIFEST);
  });

  it('moves the same for a module that keeps one folder per language', async () => {
    const dir = project();
    rmSync(join(dir, 'locales', 'en.json'));
    mkdirSync(join(dir, 'locales', 'en'));
    writeFileSync(join(dir, 'locales', 'en', 'page.json'), catalog({ 'page.title': 'Notes' }));

    const { lines } = await runIn(dir, ['fill', 'fr', join(dir, 'answers.json')]);

    expect(lines).toContain('tv.acme.notes 0.3.4 -> 0.3.5');
  });

  it('stays when the command only moved a lock, which no bundle carries', async () => {
    const dir = project();
    writeFileSync(join(dir, 'locales', 'fr.json'), catalog({ 'page.title': 'Notes' }));

    const { manifest } = await runIn(dir, ['sync']);

    expect(manifest).toBe(MANIFEST);
  });
});

describe('a set of messages that is no module', () => {
  it('is written with no manifest to bump', async () => {
    const dir = project(null);

    await run(['fill', 'fr', join(dir, 'answers.json')], {
      sets: [moduleIn(dir)],
      root: dir,
      bin: 'kroma i18n',
      print: () => {},
      atBase: () => MANIFEST,
    });

    expect(readFileSync(join(dir, 'locales', 'fr.json'), 'utf8')).toBe(
      catalog({ 'page.title': 'Notes' }),
    );
  });
});
