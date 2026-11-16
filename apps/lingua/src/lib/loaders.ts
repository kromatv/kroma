import { createServerFn } from '@tanstack/react-start';
import type { HomeView, LocaleView, NamespaceView, ProjectView } from '#site/lib/views';

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
    const { requestContext } = await import('#site/server/request');
    const { projectView } = await import('#site/server/views');
    return projectView(await requestContext(), data.id);
  });

/** `/$owner/$repo/$locale`, or null for a language the project does not offer. */
export const getLocale = createServerFn()
  .validator(localeInput)
  .handler(async ({ data }): Promise<LocaleView | null> => {
    const { requestContext } = await import('#site/server/request');
    const { localeView } = await import('#site/server/views');
    return localeView(await requestContext(), data.id, data.locale);
  });

/** `/$owner/$repo/$locale/$file`, or null for a file the source does not have. */
export const getNamespace = createServerFn()
  .validator(namespaceInput)
  .handler(async ({ data }): Promise<NamespaceView | null> => {
    const { requestContext } = await import('#site/server/request');
    const { namespaceView } = await import('#site/server/views');
    return namespaceView(await requestContext(), data.id, { locale: data.locale, file: data.file });
  });
