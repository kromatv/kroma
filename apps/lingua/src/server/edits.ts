import { z } from 'zod';
import { parseMessages } from '#site/core/catalog';
import { blocks, check, type Issue, MAX_MESSAGE } from '#site/core/checks';
import { LocaleTag, parseConfig } from '#site/core/config';
import { rowsFor } from '#site/core/rows';
import type { Store, User } from '#site/store/store';

/** `PUT /api/edits`: one message, as the contributor wants it to read. */
export const EditInput = z.object({
  project: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  locale: LocaleTag,
  namespace: z.string().min(1).max(128),
  key: z.string().min(1).max(256),
  value: z.string().max(MAX_MESSAGE * 2),
});
export type EditInput = z.infer<typeof EditInput>;

/** What a save came to, as the route answers it. */
export type EditResult =
  | { status: 200; draft: string | null; issues: Issue[] }
  | { status: 404 | 422; error: string; issues?: Issue[] };

/**
 * Keep a contributor's edit of one message, after checking the message exists
 * for that language and the text keeps the source's placeholders and
 * references. An empty value, or the text the branch already has, drops it.
 */
export async function saveEdit(store: Store, user: User, input: EditInput, now: number): Promise<EditResult> {
  const project = await store.project(input.project);
  const parsed = project?.config ? parseConfig(project.config) : null;
  const config = parsed?.ok ? parsed.config : null;
  if (!project || !config) return { status: 404, error: 'Lingua does not translate this project' };
  if (input.locale !== config.source && !config.locales.includes(input.locale)) {
    return { status: 404, error: 'This project does not offer that language' };
  }
  const files = await store.files(project.id, [...new Set([config.source, input.locale])]);
  const sourceFile = files.find((f) => f.locale === config.source && f.namespace === input.namespace);
  const source = sourceFile ? parseMessages(sourceFile.body) : null;
  const row = source ? rowsFor(source, input.locale).find((r) => r.key === input.key) : undefined;
  if (!source || !row) return { status: 404, error: 'There is no such message' };
  const targetFile = files.find((f) => f.locale === input.locale && f.namespace === input.namespace);
  const current = targetFile ? parseMessages(targetFile.body)?.[input.key] : undefined;

  if (input.value.trim() === '' || input.value === current) {
    await store.deleteEdit({ project: project.id, userId: user.id, locale: input.locale, key: input.key });
    return { status: 200, draft: null, issues: [] };
  }
  const issues = check(input.value, {
    source: row.source,
    keys: new Set(Object.keys(source)),
    plural: row.plural !== null,
  });
  if (blocks(issues)) return { status: 422, error: 'This translation would break the message', issues };
  await store.putEdit({
    project: project.id,
    userId: user.id,
    locale: input.locale,
    namespace: input.namespace,
    key: input.key,
    value: input.value,
    proposed: false,
    updatedAt: now,
  });
  return { status: 200, draft: input.value, issues };
}
