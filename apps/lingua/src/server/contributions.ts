import { languageOf } from '#site/lib/language';
import type { ContributedFile, Contribution, ContributionsView } from '#site/lib/views';
import type { Edit, Store, User } from '#site/store/store';
import { asViewer, type Context } from './views';
import { pendingOf, viewerWork } from './work';
import { openProject } from './workspace';

function unsentFiles(edits: readonly Edit[]): ContributedFile[] {
  const counts = new Map<string, number>();
  for (const edit of edits.filter((e) => !e.proposed)) counts.set(edit.file, (counts.get(edit.file) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([file, drafts]) => ({ file, drafts }));
}

async function contributionsIn(store: Store, id: string, viewer: User): Promise<Contribution[]> {
  const workspace = (await openProject(store, id, viewer))?.workspace;
  if (!workspace) return [];
  const worked = await Promise.all(workspace.locales.map(async (locale) => ({ locale, work: await viewerWork(store, id, viewer, locale) })));
  return worked.flatMap(({ locale, work }) => {
    const pending = pendingOf(work);
    if (pending.drafts === 0 && pending.proposed === 0 && work.proposal === null) return [];
    return [{ project: id, language: languageOf(locale), ...pending, proposal: work.proposal, files: unsentFiles(work.edits) }];
  });
}

/** `/contributions`: every language of every project in which the viewer has changes to send or a pull request open. */
export async function contributionsView({ store, viewer }: Context): Promise<ContributionsView> {
  if (!viewer) return { viewer: null, contributions: [] };
  const projects = await store.projects();
  const found = await Promise.all(projects.map((project) => contributionsIn(store, project.id, viewer)));
  return { viewer: asViewer(viewer), contributions: found.flat() };
}
