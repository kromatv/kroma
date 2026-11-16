import { createServerFn } from '@tanstack/react-start';
import type {
  HomeView,
  LocaleView,
  NamespaceView,
  ProjectView,
  SetupView,
  SiteView,
} from '#site/lib/views';

/** What crosses the wire for a project page: the `owner/repo` id, and nothing else a caller hung off it. */
export const projectInput = ({ id }: { id: string }) => ({ id });

/** A language page's input. */
export const localeInput = ({ id, locale }: { id: string; locale: string }) => ({ id, locale });

/** A catalog file page's input. */
export const namespaceInput = ({
  id,
  locale,
  file,
}: {
  id: string;
  locale: string;
  file: string;
}) => ({
  id,
  locale,
  file,
});

/** `/`. */
export const getHome = createServerFn().handler(async (): Promise<HomeView> => {
  const { requestContext } = await import('#site/server/request');
  const { homeView } = await import('#site/server/views');
  return homeView(await requestContext());
});

/** `/$owner/$repo`, or null for a project Lingua does not translate. */
export const getProject = createServerFn()
  .validator(projectInput)
  .handler(async ({ data }): Promise<ProjectView | null> => {
    const { refreshAfterServing, requestContext } = await import('#site/server/request');
    const { projectView } = await import('#site/server/views');
    await refreshAfterServing(data.id);
    return projectView(await requestContext(), data.id);
  });

/** `/$owner/$repo/$locale`, or null for a language the project does not offer. */
export const getLocale = createServerFn()
  .validator(localeInput)
  .handler(async ({ data }): Promise<LocaleView | null> => {
    const { refreshAfterServing, requestContext } = await import('#site/server/request');
    const { localeView } = await import('#site/server/views');
    await refreshAfterServing(data.id);
    return localeView(await requestContext(), data.id, data.locale);
  });

/** `/$owner/$repo/$locale/$file`, or null for a file the source does not have. */
export const getNamespace = createServerFn()
  .validator(namespaceInput)
  .handler(async ({ data }): Promise<NamespaceView | null> => {
    const { refreshAfterServing, requestContext } = await import('#site/server/request');
    const { namespaceView } = await import('#site/server/views');
    await refreshAfterServing(data.id);
    return namespaceView(await requestContext(), data.id, { locale: data.locale, file: data.file });
  });

/** Every page's chrome, from the root route. */
export const getSite = createServerFn().handler(async (): Promise<SiteView> => {
  const { servedRequest } = await import('#site/server/request');
  const { siteView } = await import('#site/server/views');
  const { env, origin } = await servedRequest();
  return siteView(env, origin);
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
