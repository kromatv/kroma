import { z } from 'zod';
import { LocaleTag } from '#site/core/config';
import type { Store, User } from '#site/store/store';
import { pendingOf, viewerWork } from './work';
import { openProject } from './workspace';

/** `POST /api/discard`: the language whose unsent changes the contributor throws away. */
export const DiscardInput = z.object({
  project: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  locale: LocaleTag,
});
export type DiscardInput = z.infer<typeof DiscardInput>;

/** What a discard came to: how many changes went, and whether the language went with them. */
export type DiscardResult =
  | { status: 200; discarded: number; removed: boolean }
  | { status: 404; error: string };

/**
 * Throw away every change the contributor holds unsent in one language: their
 * edits, their confirms and, for a language they started and never sent, the
 * language itself. What already rides in their pull request stays there.
 */
export async function discardDrafts(store: Store, user: User, input: DiscardInput): Promise<DiscardResult> {
  const workspace = (await openProject(store, input.project, user))?.workspace;
  if (!workspace) return { status: 404, error: 'Lingua does not translate this project' };
  if (!workspace.locales.includes(input.locale)) return { status: 404, error: 'This project does not offer that language' };
  const work = await viewerWork(store, input.project, user, input.locale);
  await store.dropUnsent(input.project, user.id, input.locale);
  const removed = workspace.started.has(input.locale) && work.start?.proposed === false;
  return { status: 200, discarded: pendingOf(work).drafts, removed };
}
