import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * One shipped package and the terms it ships under: the license its manifest
 * declares, where its source lives, and its license and notice files verbatim.
 */
export interface Notice {
  name: string;
  version: string;
  license: string | null;
  source: string | null;
  texts: string[];
}

const RULE = '-'.repeat(72);
const LICENSE_FILE = /^(licen[cs]e|copying|notice)([.\-_].*)?$/i;

/** The license and notice files at the top of a package's folder, in name order. */
export function licenseTexts(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && LICENSE_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => readFileSync(join(dir, name), 'utf8').trim())
    .filter((text) => text.length > 0);
}

const label = (notice: Notice) => `${notice.name} ${notice.version}`;

/**
 * A section of THIRD-PARTY-NOTICES.txt: every package with its license, then
 * each distinct license text once, under the packages that ship it.
 */
export function renderNotices(title: string, notices: readonly Notice[]): string {
  const sorted = [...notices].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
  const users = new Map<string, string[]>();
  for (const notice of sorted) {
    for (const text of notice.texts) users.set(text, [...(users.get(text) ?? []), label(notice)]);
  }
  const bare = sorted.filter((notice) => notice.texts.length === 0);

  return [
    title,
    '='.repeat(title.length),
    '',
    ...sorted.map((notice) => `  ${label(notice)}  ${notice.license ?? 'no license declared'}`),
    ...(bare.length > 0 ? ['', 'Carrying no license file, so see their source:', ''] : []),
    ...bare.map((notice) => `  ${label(notice)}  ${notice.source ?? 'no source named'}`),
    ...[...users].flatMap(([text, names]) => [
      '',
      RULE,
      ...names.map((name) => `  ${name}`),
      '',
      text,
    ]),
    RULE,
  ].join('\n');
}
