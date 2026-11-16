import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type CatalogSet,
  digest as toolsDigest,
  inspectLocale,
  parseLock as toolsParseLock,
  readSource,
  renderLock as toolsRenderLock,
} from '@kromatv/i18n-tools';
import { describe, expect, it } from 'vitest';
import { placeOf } from './config';
import { digest, digests, inspect, parseLock, renderLock } from './lock';
import { parsePolicy } from './policy';
import { localeFiles, localesOn, lockOn, type Shelf, shelfOf } from './shelf';
import { merged, sourceOf } from './source';

const ROOT = 'packages/core/src/locales';
const DIR = fileURLToPath(new URL(`../../../../${ROOT}`, import.meta.url));

function repositoryShelf(): Shelf {
  const files = readdirSync(DIR, { recursive: true, encoding: 'utf8' })
    .map((entry) => `${ROOT}/${entry.split('\\').join('/')}`)
    .filter((path) => placeOf(ROOT, path) !== null)
    .map((path) => ({ path, body: readFileSync(join(DIR, path.slice(ROOT.length + 1)), 'utf8') }));
  return shelfOf(ROOT, files);
}

const shelf = repositoryShelf();
const parsed = parsePolicy(readFileSync(join(DIR, 'i18n.json'), 'utf8'));
const policy = parsed.ok ? parsed.policy : { source: '' };
const set: CatalogSet = { name: 'core', dir: DIR, layout: 'folder', project: policy };
const source = sourceOf(policy.source, localeFiles(shelf, policy.source));
const translations = localesOn(shelf).filter((locale) => locale !== policy.source);

const keysIn = (standing: Map<string, string>, state: string) =>
  [...standing].filter(([, s]) => s === state).map(([key]) => key);

async function linguaReading(locale: string) {
  const against = { source, digests: await digests(source.messages.values()) };
  return inspect(against, merged(localeFiles(shelf, locale)), lockOn(shelf, locale));
}

describe("this repository's catalogs", { timeout: 60_000 }, () => {
  it('have a source language and at least one translation with a lock', () => {
    expect(parsed.ok).toBe(true);
    expect(translations.some((locale) => lockOn(shelf, locale).size > 0)).toBe(true);
  });

  it('digest every source message as i18n-tools does', async () => {
    const messages = [...source.messages.values()];

    const ours = await Promise.all(messages.map(digest));

    expect(ours).toEqual(messages.map(toolsDigest));
  });

  it('render every lock byte for byte as i18n-tools does', () => {
    const locks = translations.flatMap((locale) => {
      const text = shelf.files.get(`${ROOT}/${locale}/i18n.lock`);
      return text === undefined ? [] : [text];
    });

    expect(locks.map((text) => renderLock(parseLock(text)))).toEqual(locks);
    expect(locks.map((text) => toolsRenderLock(toolsParseLock(text)))).toEqual(locks);
  });

  it('come to the lock i18n-tools would write for each translation', async () => {
    const tools = readSource(set);

    const ours = await Promise.all(translations.map(async (l) => (await linguaReading(l)).next));

    expect(ours.map(renderLock)).toEqual(
      translations.map((locale) => toolsRenderLock(inspectLocale(set, tools, locale).nextLock)),
    );
  });

  it('tell missing, outdated and unreviewed messages apart as i18n-tools does', async () => {
    const tools = readSource(set);

    const ours = await Promise.all(
      translations.map(async (l) => (await linguaReading(l)).standing),
    );

    expect(
      ours.map((s) => [keysIn(s, 'missing'), keysIn(s, 'outdated'), keysIn(s, 'unreviewed')]),
    ).toEqual(
      translations.map((locale) => {
        const status = inspectLocale(set, tools, locale);
        return [status.missing, status.outdated, status.unreviewed];
      }),
    );
  });
});
