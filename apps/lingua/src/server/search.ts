import { languageOf } from '#site/lib/language';
import { searchMessages } from '#site/lib/message-search';
import type { IndexedProject, MessageHit } from '#site/lib/views';
import { rowsByFile } from './standing';
import type { Context } from './views';
import { openProject, readLocales } from './workspace';

/** Every project with the languages the viewer can open in it, for the command menu. */
export async function projectIndex({ store, viewer }: Context): Promise<IndexedProject[]> {
  const projects = await store.projects();
  const opened = await Promise.all(
    projects.map((project) => openProject(store, project.id, viewer)),
  );
  return opened.flatMap((found) =>
    found
      ? [{ id: found.project.id, languages: (found.workspace?.locales ?? []).map(languageOf) }]
      : [],
  );
}

/** The messages of `locale` in project `id` whose key, source or translation mention `query`, the closest first. */
export async function messageSearch(
  { store, viewer }: Context,
  id: string,
  at: { locale: string; query: string },
): Promise<MessageHit[]> {
  if (at.query.trim().length < 2) {
    return [];
  }
  const workspace = (await openProject(store, id, viewer))?.workspace;
  if (!workspace?.locales.includes(at.locale)) {
    return [];
  }
  const byFile = await rowsByFile(
    await readLocales(store, { id, workspace }, [at.locale]),
    at.locale,
  );
  const all = [...byFile].flatMap(([file, rows]) =>
    rows.map(({ row, current }) => ({ key: row.key, file, source: row.source, text: current })),
  );
  return searchMessages(all, at.query);
}
