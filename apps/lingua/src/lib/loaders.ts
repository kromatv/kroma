import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { LocaleTag, ProjectId } from '#site/core/config';
import type {
  ContributionsView,
  HomeView,
  IndexedProject,
  LocaleView,
  MessageHit,
  NamespaceView,
  ProjectView,
  SetupView,
  SiteView,
} from '#site/lib/views';

/** A project page's input: the `owner/repo` id. */
export const ProjectInput = z.object({ id: ProjectId });

/** A language page's input. */
export const LocaleInput = ProjectInput.extend({ locale: LocaleTag });

/** A catalog file page's input. */
export const NamespaceInput = LocaleInput.extend({ file: z.string().max(256) });

/** A search's input: the language to look in and what was typed, cut at 200 characters. */
export const SearchInput = LocaleInput.extend({
  query: z.string().transform((query) => query.slice(0, 200)),
});

/**
 * What a server function reads its input through: `schema`'s output, or null
 * for anything else, so an address that names no project, language or file
 * finds nothing instead of failing.
 */
export function readAs<S extends z.ZodType>(schema: S) {
  return (input: z.input<S>): z.output<S> | null => schema.safeParse(input).data ?? null;
}

/** `/`. */
export const getHome = createServerFn().handler(async (): Promise<HomeView> => {
  const { requestContext } = await import('#site/server/request');
  const { homeView } = await import('#site/server/views');
  return homeView(await requestContext());
});

/** `/$owner/$repo`, or null for a project Lingua does not translate. */
export const getProject = createServerFn()
  .validator(readAs(ProjectInput))
  .handler(async ({ data }): Promise<ProjectView | null> => {
    if (!data) {
      return null;
    }
    const { refreshAfterServing, requestContext } = await import('#site/server/request');
    const { projectView } = await import('#site/server/views');
    await refreshAfterServing(data.id);
    return projectView(await requestContext(), data.id);
  });

/** `/$owner/$repo/$locale`, or null for a language the project does not offer. */
export const getLocale = createServerFn()
  .validator(readAs(LocaleInput))
  .handler(async ({ data }): Promise<LocaleView | null> => {
    if (!data) {
      return null;
    }
    const { refreshAfterServing, requestContext } = await import('#site/server/request');
    const { localeView } = await import('#site/server/views');
    await refreshAfterServing(data.id);
    return localeView(await requestContext(), data.id, data.locale);
  });

/** `/$owner/$repo/$locale/$file`, or null for a file the source does not have. */
export const getNamespace = createServerFn()
  .validator(readAs(NamespaceInput))
  .handler(async ({ data }): Promise<NamespaceView | null> => {
    if (!data) {
      return null;
    }
    const { refreshAfterServing, requestContext } = await import('#site/server/request');
    const { namespaceView } = await import('#site/server/views');
    await refreshAfterServing(data.id);
    return namespaceView(await requestContext(), data.id, { locale: data.locale, file: data.file });
  });

/** `/contributions`. */
export const getContributions = createServerFn().handler(async (): Promise<ContributionsView> => {
  const { requestContext } = await import('#site/server/request');
  const { contributionsView } = await import('#site/server/contributions');
  return contributionsView(await requestContext());
});

/** Every project and its languages, for the command menu. */
export const getProjectIndex = createServerFn().handler(async (): Promise<IndexedProject[]> => {
  const { requestContext } = await import('#site/server/request');
  const { projectIndex } = await import('#site/server/search');
  return projectIndex(await requestContext());
});

/** The messages of a language that mention a query, for the command menu. */
export const findMessages = createServerFn()
  .validator(readAs(SearchInput))
  .handler(async ({ data }): Promise<MessageHit[]> => {
    if (!data) {
      return [];
    }
    const { requestContext } = await import('#site/server/request');
    const { messageSearch } = await import('#site/server/search');
    return messageSearch(await requestContext(), data.id, {
      locale: data.locale,
      query: data.query,
    });
  });

/** Every page's chrome, from the root route. */
export const getSite = createServerFn().handler(async (): Promise<SiteView> => {
  const { requestContext, servedRequest } = await import('#site/server/request');
  const { siteView } = await import('#site/server/views');
  const { origin } = await servedRequest();
  return siteView(await requestContext(), origin);
});

/** `/setup`. */
export const getSetup = createServerFn().handler(async (): Promise<SetupView> => {
  const { refreshAfterServing, requestContext, servedRequest } =
    await import('#site/server/request');
  const { setupView } = await import('#site/server/setup');
  const { origin } = await servedRequest();
  const view = await setupView(await requestContext(), origin);
  await Promise.all(
    view.repositories.filter((r) => r.checkedAt === null).map((r) => refreshAfterServing(r.id)),
  );
  return view;
});
