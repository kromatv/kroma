import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { offeredLocales } from './project.ts';

const dirs: string[] = [];

function project(policy: object): string {
  const dir = mkdtempSync(join(tmpdir(), 'kroma-project-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'i18n.json'), JSON.stringify(policy));
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('offeredLocales', () => {
  it('names the source first, then every locale past a draft', () => {
    const dir = project({
      source: 'en',
      locales: { fr: { stage: 'stable' }, de: { stage: 'draft' }, ko: { stage: 'beta' }, it: {} },
    });

    expect(offeredLocales(dir)).toEqual(['en', 'fr', 'ko']);
  });

  it('offers the source alone when the project names no other locale', () => {
    expect(offeredLocales(project({ source: 'fr' }))).toEqual(['fr']);
  });
});
