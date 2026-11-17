import { z } from 'zod';
import { LocaleTag, ProjectId } from '#site/core/config';
import { nameOf } from '#site/core/start';
import type { Store } from '#site/store/store';
import type { Actor } from './actor';
import { openProject, type Workspace } from './workspace';

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

async function refusal(
  store: Store,
  workspace: Workspace,
  input: LocaleInput,
): Promise<string | null> {
  const folder = await store.files(input.project, [input.locale]);
  if (workspace.locales.includes(input.locale) || folder.length > 0) {
    return 'The project has that language already';
  }
  return workspace.started.size < MAX_STARTED
    ? null
    : 'Send or discard a language you started before you start another';
}

/** Record a language the contributor starts: theirs alone until they send it, when their pull request adds it as a draft. */
export async function startLanguage(
  store: Store,
  by: Actor,
  input: LocaleInput,
): Promise<LocaleResult> {
  const workspace = (await openProject(store, input.project, by.user))?.workspace;
  if (!workspace) {
    return { status: 404, error: 'Lingua does not translate this project' };
  }
  const error = await refusal(store, workspace, input);
  if (error) {
    return { status: 409, error };
  }
  const { project, locale } = input;
  await store.putStart({ project, userId: by.user.id, locale, proposed: false, createdAt: by.now });
  return { status: 200, locale, name: nameOf(locale, locale) ?? locale };
}
