import { z } from 'zod';
import type { Messages } from '#site/core/catalog';
import { blocks, check, type Issue, MAX_MESSAGE } from '#site/core/checks';
import { LocaleTag, ProjectId } from '#site/core/config';
import { type Row, rowsFor } from '#site/core/rows';
import { localeFiles, shelfOf } from '#site/core/shelf';
import { merged } from '#site/core/source';
import type { Store } from '#site/store/store';
import type { Actor } from './actor';
import { openProject, type Workspace } from './workspace';

/** `PUT /api/edits`: one message, as the contributor wants it to read. */
export const EditInput = z.object({
  project: ProjectId,
  locale: LocaleTag,
  file: z.string().nonempty().max(256),
  key: z.string().nonempty().max(256),
  value: z.string().max(MAX_MESSAGE * 2),
});
export type EditInput = z.infer<typeof EditInput>;

/** What a save came to, as the route answers it. */
export type EditResult =
  | { status: 200; draft: string | null; issues: Issue[] }
  | { status: 404 | 422; error: string; issues?: Issue[] };

interface Found {
  source: Messages;
  row: Row;
  current: string | undefined;
}

async function messageOf(
  store: Store,
  workspace: Workspace,
  input: EditInput,
): Promise<Found | null> {
  const locales = [...new Set([workspace.policy.source, input.locale])];
  const shelf = shelfOf(workspace.root, await store.files(input.project, locales));
  const source = localeFiles(shelf, workspace.policy.source).get(input.file);
  const row = source ? rowsFor(source, input.locale).find((r) => r.key === input.key) : undefined;
  if (!source || !row) {
    return null;
  }
  return { source, row, current: merged(localeFiles(shelf, input.locale))[input.key] };
}

async function keep(
  store: Store,
  by: Actor,
  edit: Found & { input: EditInput },
): Promise<EditResult> {
  const { input, row } = edit;
  const which = {
    project: input.project,
    userId: by.user.id,
    locale: input.locale,
    key: input.key,
  };
  if (input.value.trim() === '' || input.value === edit.current) {
    await store.deleteEdit(which);
    return { status: 200, draft: null, issues: [] };
  }
  const keys = new Set(Object.keys(edit.source));
  const issues = check(input.value, { source: row.source, keys, plural: row.plural !== null });
  if (blocks(issues)) {
    return { status: 422, error: 'This translation would break the message', issues };
  }
  const { file, value } = input;
  await store.putEdit({ ...which, file, value, proposed: false, updatedAt: by.now });
  return { status: 200, draft: value, issues };
}

/**
 * Keep a contributor's edit of one message, after checking the message exists
 * for that language and the text keeps the source's placeholders and
 * references. An empty value, or the text the branch already has, drops it.
 */
export async function saveEdit(store: Store, by: Actor, input: EditInput): Promise<EditResult> {
  const workspace = (await openProject(store, input.project, by.user))?.workspace;
  if (!workspace) {
    return { status: 404, error: 'Lingua does not translate this project' };
  }
  if (!workspace.locales.includes(input.locale)) {
    return { status: 404, error: 'This project does not offer that language' };
  }
  const found = await messageOf(store, workspace, input);
  if (!found) {
    return { status: 404, error: 'There is no such message' };
  }
  return keep(store, by, { ...found, input });
}
