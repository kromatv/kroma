import { applyEdits, type Messages, parseMessages, serializeMessages } from '#site/core/catalog';
import { catalogPath, type LinguaConfig } from '#site/core/config';
import { rowsFor } from '#site/core/rows';
import type { Edit, FileRow } from '#site/store/store';

/** One namespace a proposal rewrites: where its file lives for the language, and the edits it carries. */
export interface Target {
  namespace: string;
  path: string;
  order: string[];
  edits: Messages;
}

/** What a proposal is planned from: the config, the synced files, and one contributor's edits for `locale`. */
export interface Planned {
  config: LinguaConfig;
  files: readonly FileRow[];
  edits: readonly Edit[];
  locale: string;
}

function byNamespace(edits: readonly Edit[]): Map<string, Messages> {
  const grouped = new Map<string, Messages>();
  for (const edit of edits) {
    grouped.set(edit.namespace, { ...grouped.get(edit.namespace), [edit.key]: edit.value });
  }
  return grouped;
}

/** The files a contributor's edits land in, grouped by namespace and placed by the source file's template. */
export function targetsFor({ config, files, edits, locale }: Planned): Target[] {
  return [...byNamespace(edits)].flatMap(([namespace, messages]) => {
    const source = files.find((f) => f.locale === config.source && f.namespace === namespace);
    const template = source ? config.catalogs[source.catalog]?.path : undefined;
    const sourceMessages = source ? parseMessages(source.body) : null;
    if (!template || !sourceMessages) {
      return [];
    }
    return [
      {
        namespace,
        path: catalogPath(template, locale, namespace),
        order: rowsFor(sourceMessages, locale).map((row) => row.key),
        edits: messages,
      },
    ];
  });
}

/** The new text of each target file, given what the branch holds now, leaving out files the edits do not change. */
export function rewrite(
  targets: readonly Target[],
  current: ReadonlyMap<string, string>,
): { path: string; content: string }[] {
  return targets.flatMap((target) => {
    const before = current.get(target.path);
    const base = before === undefined ? {} : (parseMessages(before) ?? {});
    const content = serializeMessages(applyEdits(base, target.edits, target.order));
    return content === before ? [] : [{ path: target.path, content }];
  });
}
