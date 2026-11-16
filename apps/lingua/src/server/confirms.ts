import { z } from 'zod';
import { LocaleTag } from '#site/core/config';
import { localeFiles, shelfOf } from '#site/core/shelf';
import { baseOf, sourceOf } from '#site/core/source';
import type { Store, User } from '#site/store/store';
import { openProject } from './workspace';

/** `POST /api/confirm`: messages of one language the contributor says read right as they are. */
export const ConfirmInput = z.object({
  project: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  locale: LocaleTag,
  keys: z.array(z.string().min(1).max(256)).min(1).max(200),
});
export type ConfirmInput = z.infer<typeof ConfirmInput>;

/** What a confirm came to, as the route answers it: the messages it holds, by their base key. */
export type ConfirmResult = { status: 200; confirmed: string[] } | { status: 404; error: string };

/** Keep the contributor's confirms until their next send rewrites those lock entries against the current source. */
export async function saveConfirms(
  store: Store,
  user: User,
  input: ConfirmInput,
  now: number,
): Promise<ConfirmResult> {
  const workspace = (await openProject(store, input.project, user))?.workspace;
  if (!workspace) {
    return { status: 404, error: 'Lingua does not translate this project' };
  }
  const { source: sourceLocale } = workspace.policy;
  if (!workspace.locales.includes(input.locale) || input.locale === sourceLocale) {
    return { status: 404, error: 'This project does not translate that language' };
  }
  const shelf = shelfOf(workspace.root, await store.files(input.project, [sourceLocale]));
  const source = sourceOf(sourceLocale, localeFiles(shelf, sourceLocale));
  const confirmed = [...new Set(input.keys.flatMap((key) => baseOf(source, key) ?? []))];
  if (confirmed.length === 0) {
    return { status: 404, error: 'There is no such message' };
  }
  const mine = { project: input.project, userId: user.id, locale: input.locale };
  await Promise.all(
    confirmed.map((key) => store.putConfirm({ ...mine, key, proposed: false, updatedAt: now })),
  );
  return { status: 200, confirmed };
}
