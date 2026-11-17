import { generalForm, groupMessages } from '@kromatv/i18n/model';
import type { Messages } from './catalog';
import { placeOf } from './config';
import { fill } from './fill';
import { type Baseline, confirmed, digests, inspect } from './lock';
import { parsePolicy } from './policy';
import { localeFiles, lockOn, projectFile, type Shelf, writeLock } from './shelf';
import { startLocale } from './start';
import { baseOf, merged, type Source, sourceOf } from './source';

/** What one contributor sends for one language: their texts by key, the messages they confirm, and whether they start it. */
export interface Work {
  readonly locale: string;
  readonly edits: Readonly<Messages>;
  readonly confirms: readonly string[];
  readonly start: boolean;
}

/** A file a send writes, by repository path. */
export interface Change {
  path: string;
  content: string;
}

/** What a send comes to: the files it writes, and the plural messages its edits leave without a general form. */
export interface Plan {
  changes: Change[];
  incomplete: string[];
}

function changesBetween(before: Shelf, after: Shelf): Change[] {
  return [...after.files]
    .filter(([path, content]) => before.files.get(path) !== content)
    .map(([path, content]) => ({ path, content }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
}

function lockedLocales(before: Shelf, after: Shelf, work: Work): string[] {
  const moved = changesBetween(before, after).flatMap((change) => {
    const place = placeOf(after.root, change.path);
    return place?.kind === 'catalog' ? [place.locale] : [];
  });
  return [...new Set([...moved, ...(work.confirms.length > 0 ? [work.locale] : [])])];
}

async function relock(
  draft: Shelf,
  against: Baseline,
  { work, locales }: { work: Work; locales: readonly string[] },
) {
  const others = locales.filter((locale) => locale !== against.source.locale);
  const locks = await Promise.all(
    others.map(async (locale) => {
      const catalog = merged(localeFiles(draft, locale));
      const { next } = await inspect(against, catalog, lockOn(draft, locale));
      return [
        locale,
        locale === work.locale ? confirmed(against, next, work.confirms) : next,
      ] as const;
    }),
  );
  for (const [locale, lock] of locks) {
    writeLock(draft, locale, lock);
  }
}

function incompleteIn(draft: Shelf, source: Source, at: { locale: string; written: string[] }) {
  const bases = new Set(at.written.flatMap((key) => baseOf(source, key) ?? []));
  const { messages } = groupMessages(merged(localeFiles(draft, at.locale)), source.bases);
  return [...bases].filter((base) => {
    const message = messages.get(base);
    return message !== undefined && !generalForm(message);
  });
}

/** Apply one contributor's work to `shelf` as `i18n add`, `fill`, `sync` and `confirm` would, and say what moved. */
export async function planSend(shelf: Shelf, work: Work): Promise<Plan> {
  const parsed = parsePolicy(projectFile(shelf, 'policy'));
  if (!parsed.ok) {
    return { changes: [], incomplete: [] };
  }
  const draft: Shelf = { root: shelf.root, files: new Map(shelf.files) };
  if (work.start) {
    startLocale(draft, parsed.policy, work.locale);
  }
  const source = sourceOf(parsed.policy.source, localeFiles(draft, parsed.policy.source));
  const written = fill(draft, source, { locale: work.locale, entries: work.edits });
  const against = { source, digests: await digests(source.messages.values()) };
  await relock(draft, against, { work, locales: lockedLocales(shelf, draft, work) });
  return {
    changes: changesBetween(shelf, draft),
    incomplete: incompleteIn(draft, source, { locale: work.locale, written }),
  };
}
