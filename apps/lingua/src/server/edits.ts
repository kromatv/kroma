import { z } from 'zod';
import { blocks, check, type Issue, MAX_MESSAGE } from '#site/core/checks';
import { LocaleTag, ProjectId } from '#site/core/config';
import { rowsFor } from '#site/core/rows';
import { localeFiles, shelfOf } from '#site/core/shelf';
import { merged } from '#site/core/source';
import type { Store, User } from '#site/store/store';
import { openProject } from './workspace';

/** `PUT /api/edits`: one message, as the contributor wants it to read. */
export const EditInput = z.object({
  project: ProjectId,
  locale: LocaleTag,
  file: z.string().min(1).max(256),
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
export async function saveEdit(
  store: Store,
  user: User,
  input: EditInput,
  now: number,
): Promise<EditResult> {
  const workspace = (await openProject(store, input.project, user))?.workspace;
  if (!workspace) return { status: 404, error: 'Lingua does not translate this project' };
  if (!workspace.locales.includes(input.locale))
    return { status: 404, error: 'This project does not offer that language' };
  const files = await store.files(input.project, [
    ...new Set([workspace.policy.source, input.locale]),
  ]);
  const shelf = shelfOf(workspace.root, files);
  const source = localeFiles(shelf, workspace.policy.source).get(input.file);
  const row = source ? rowsFor(source, input.locale).find((r) => r.key === input.key) : undefined;
  if (!source || !row) return { status: 404, error: 'There is no such message' };
  const current = merged(localeFiles(shelf, input.locale))[input.key];
  const which = { project: input.project, userId: user.id, locale: input.locale, key: input.key };

  if (input.value.trim() === '' || input.value === current) {
    await store.deleteEdit(which);
    return { status: 200, draft: null, issues: [] };
  }
  const issues = check(input.value, {
    source: row.source,
    keys: new Set(Object.keys(source)),
    plural: row.plural !== null,
  });
  if (blocks(issues))
    return { status: 422, error: 'This translation would break the message', issues };
  await store.putEdit({
    ...which,
    file: input.file,
    value: input.value,
    proposed: false,
    updatedAt: now,
  });
  return { status: 200, draft: input.value, issues };
}
