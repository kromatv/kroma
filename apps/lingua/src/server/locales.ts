import { z } from 'zod';
import { LocaleTag, ProjectId } from '#site/core/config';
import { nameOf } from '#site/core/start';
import type { Store, User } from '#site/store/store';
import { openProject } from './workspace';

/** `POST /api/locales`: a language to start translating the project into. */
export const LocaleInput = z.object({
  project: ProjectId,
  locale: LocaleTag,
});
export type LocaleInput = z.infer<typeof LocaleInput>;

/** How many languages one contributor may hold started in a project before one of them merges or is discarded. */
export const MAX_STARTED = 8;

/** What starting a language came to, as the route answers it. */
export type LocaleResult =
  | { status: 200; locale: string; name: string }
  | { status: 404 | 409; error: string };

/** Record a language the contributor starts: theirs alone until they send it, when their pull request adds it as a draft. */
export async function startLanguage(
  store: Store,
  user: User,
  input: LocaleInput,
  now: number,
): Promise<LocaleResult> {
  const workspace = (await openProject(store, input.project, user))?.workspace;
  if (!workspace) {
    return { status: 404, error: 'Lingua does not translate this project' };
  }
  const folder = await store.files(input.project, [input.locale]);
  if (workspace.locales.includes(input.locale) || folder.length > 0) {
    return { status: 409, error: 'The project has that language already' };
  }
  if (workspace.started.size >= MAX_STARTED) {
    return {
      status: 409,
      error: 'Send or discard a language you started before you start another',
    };
  }
  await store.putStart({
    project: input.project,
    userId: user.id,
    locale: input.locale,
    proposed: false,
    createdAt: now,
  });
  return {
    status: 200,
    locale: input.locale,
    name: nameOf(input.locale, input.locale) ?? input.locale,
  };
}
