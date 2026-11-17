import type { Messages } from '#site/core/catalog';
import { check } from '#site/core/checks';
import { notesFor } from '#site/core/notes';
import { stableLocales } from '#site/core/policy';
import { localeFiles } from '#site/core/shelf';
import { baseOf, fileOf, merged, type Source } from '#site/core/source';
import { languageOf } from '#site/lib/language';
import type {
  HomeView,
  Language,
  LocaleView,
  NamespaceView,
  ProjectSummary,
  ProjectView,
  RowView,
  SiteView,
  Viewer,
} from '#site/lib/views';
import type { Store, User } from '#site/store/store';
import { type Env, oauthCredentials } from './env';
import { localeSummary, rowsByFile, type Stood, tally } from './standing';
import { syncOf } from './sync-state';
import { pendingOf, type Work, viewerWork } from './work';
import { type Opened, openProject, type Reading, readLocales, type Workspace } from './workspace';

/** What every page is computed from: the store, the bindings, and who is asking. */
export interface Context {
  env: Env;
  store: Store;
  viewer: User | null;
}

/** The signed-in contributor as the header shows them. */
export const asViewer = (user: User | null): Viewer | null =>
  user ? { login: user.login, name: user.name, avatarUrl: user.avatarUrl } : null;

function summaryOf({ project, workspace, error }: Opened): ProjectSummary {
  return {
    id: project.id,
    branch: project.branch,
    source: workspace ? languageOf(workspace.policy.source) : null,
    locales: workspace?.locales.length ?? 0,
    syncedAt: project.syncedAt,
    error,
    sync: syncOf(project),
  };
}

function draftsIn(work: Work, source: Source, file: string): number {
  const edits = work.edits.filter((e) => e.file === file && !e.proposed).length;
  return edits + work.confirms.filter((c) => !c.proposed && fileOf(source, c.key) === file).length;
}

async function offered(store: Store, id: string, viewer: User | null) {
  const opened = await openProject(store, id, viewer);
  return opened?.workspace ? { opened, workspace: opened.workspace } : null;
}

/** `/`. */
export async function homeView({ store, viewer }: Context): Promise<HomeView> {
  const projects = await store.projects();
  const opened = await Promise.all(projects.map((project) => openProject(store, project.id, null)));
  return { viewer: asViewer(viewer), projects: opened.flatMap((o) => (o ? [summaryOf(o)] : [])) };
}

/** `/$owner/$repo`. */
export async function projectView(
  { store, viewer }: Context,
  id: string,
): Promise<ProjectView | null> {
  const opened = await openProject(store, id, viewer);
  if (!opened) {
    return null;
  }
  const { workspace } = opened;
  const reading = workspace ? await readLocales(store, { id, workspace }, workspace.locales) : null;
  const locales =
    workspace && reading
      ? await Promise.all(
          workspace.locales.map(async (tag) =>
            localeSummary(workspace, languageOf(tag), await rowsByFile(reading, tag)),
          ),
        )
      : [];
  return {
    viewer: asViewer(viewer),
    project: summaryOf(opened),
    repoUrl: `https://github.com/${id}`,
    locales,
  };
}

/** `/$owner/$repo/$locale`. */
export async function localeView(
  { store, viewer }: Context,
  id: string,
  locale: string,
): Promise<LocaleView | null> {
  const found = await offered(store, id, viewer);
  if (!found?.workspace.locales.includes(locale)) {
    return null;
  }
  const { opened, workspace } = found;
  const reading = await readLocales(store, { id, workspace }, [locale]);
  const byFile = await rowsByFile(reading, locale);
  const work = await viewerWork(store, viewer, { project: id, locale });
  return {
    viewer: asViewer(viewer),
    project: summaryOf(opened),
    locale: localeSummary(workspace, languageOf(locale), byFile),
    namespaces: [...byFile]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, rows]) => {
        const { progress, states } = tally(rows);
        return { file, progress, states, drafts: draftsIn(work, reading.source, file) };
      }),
    ...pendingOf(work),
    proposal: work.proposal,
  };
}

interface Around {
  source: Source;
  keys: ReadonlySet<string>;
  referenced: { language: Language; messages: Messages }[];
  work: Work;
  workspace: Workspace;
}

function aroundOf(
  reading: Reading,
  file: string,
  rest: Pick<Around, 'work' | 'workspace'> & { references: readonly string[] },
): Around | null {
  const sourceFile = reading.source.files.get(file);
  if (!sourceFile) {
    return null;
  }
  const referenced = rest.references.map((tag) => ({
    language: languageOf(tag),
    messages: merged(localeFiles(reading.shelf, tag)),
  }));
  const keys = new Set(Object.keys(sourceFile));
  return { source: reading.source, keys, referenced, work: rest.work, workspace: rest.workspace };
}

function draftOf(work: Work, key: string): Pick<RowView, 'draft' | 'proposed'> {
  const edit = work.edits.find((e) => e.key === key);
  return { draft: edit?.value ?? null, proposed: edit?.proposed ?? false };
}

function issuesOf(row: Stood['row'], shown: string, keys: ReadonlySet<string>): RowView['issues'] {
  if (shown.trim() === '') {
    return [];
  }
  return check(shown, { source: row.source, keys, plural: row.plural !== null });
}

function rowView({ row, current, state }: Stood, around: Around): RowView {
  const { draft, proposed } = draftOf(around.work, row.key);
  const base = baseOf(around.source, row.key) ?? row.key;
  return {
    key: row.key,
    source: row.source,
    references: around.referenced.map(({ language, messages }) => ({
      language,
      text: messages[row.key] ?? null,
    })),
    current,
    draft,
    proposed,
    plural: row.plural,
    issues: issuesOf(row, draft ?? current ?? '', around.keys),
    state,
    notes: notesFor(around.workspace.notes, base),
    confirmed: around.work.confirms.some((c) => c.key === base),
  };
}

/** `/$owner/$repo/$locale/$file`. */
export async function namespaceView(
  { store, viewer }: Context,
  id: string,
  at: { locale: string; file: string },
): Promise<NamespaceView | null> {
  const found = await offered(store, id, viewer);
  if (!found?.workspace.locales.includes(at.locale)) {
    return null;
  }
  const { opened, workspace } = found;
  const references = stableLocales(workspace.policy).filter((tag) => tag !== at.locale);
  const reading = await readLocales(store, { id, workspace }, [at.locale, ...references]);
  const work = await viewerWork(store, viewer, { project: id, locale: at.locale });
  const around = aroundOf(reading, at.file, { references, work, workspace });
  if (!around) {
    return null;
  }
  const byFile = await rowsByFile(reading, at.locale);
  return {
    viewer: asViewer(viewer),
    project: summaryOf(opened),
    locale: localeSummary(workspace, languageOf(at.locale), byFile),
    file: at.file,
    rows: (byFile.get(at.file) ?? []).map((stood) => rowView(stood, around)),
    ...pendingOf(work),
    proposal: work.proposal,
  };
}

/** What every page's chrome shows: where this deployment answers, whether anyone can sign in, and who is looking. */
export function siteView({ env, viewer }: Context, origin: string): SiteView {
  return { origin, signIn: oauthCredentials(env) !== null, viewer: asViewer(viewer) };
}
