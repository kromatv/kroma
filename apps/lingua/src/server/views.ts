import { type Messages, parseMessages } from '#site/core/catalog';
import { check } from '#site/core/checks';
import { type LinguaConfig, parseConfig } from '#site/core/config';
import { progressOf, rowsFor } from '#site/core/rows';
import type {
  HomeView,
  Language,
  LocaleSummary,
  LocaleView,
  NamespaceView,
  ProjectSummary,
  ProjectView,
  ProposalView,
  RowView,
  Viewer,
} from '#site/lib/views';
import type { Edit, FileRow, Project, Store, User } from '#site/store/store';
import { type Env, installUrl } from './env';

/** What every page is computed from: the store, the bindings, and who is asking. */
export interface Context {
  env: Env;
  store: Store;
  viewer: User | null;
}

const english = new Intl.DisplayNames(['en'], { type: 'language' });

/** A language tag named in English and in itself, falling back to the tag. */
export function languageOf(tag: string): Language {
  try {
    return {
      tag,
      name: english.of(tag) ?? tag,
      nativeName: new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag,
    };
  } catch {
    return { tag, name: tag, nativeName: tag };
  }
}

const viewerOf = (user: User | null): Viewer | null =>
  user ? { login: user.login, name: user.name, avatarUrl: user.avatarUrl } : null;

function configOf(project: Project): LinguaConfig | null {
  if (!project.config) return null;
  const parsed = parseConfig(project.config);
  return parsed.ok ? parsed.config : null;
}

function summaryOf(project: Project, config: LinguaConfig | null): ProjectSummary {
  return {
    id: project.id,
    source: config ? languageOf(config.source) : null,
    locales: config ? new Set([config.source, ...config.locales]).size : 0,
    syncedAt: project.syncedAt,
    error: project.configError,
  };
}

function byNamespace(files: readonly FileRow[], locale: string): Map<string, Messages> {
  const out = new Map<string, Messages>();
  for (const file of files) {
    if (file.locale !== locale) continue;
    const messages = parseMessages(file.body);
    if (messages) out.set(file.namespace, { ...out.get(file.namespace), ...messages });
  }
  return out;
}

function localeSummary(config: LinguaConfig, sources: Map<string, Messages>, files: readonly FileRow[], locale: string): LocaleSummary {
  const target = byNamespace(files, locale);
  let done = 0;
  let total = 0;
  for (const [namespace, source] of sources) {
    const progress = progressOf(rowsFor(source, locale), target.get(namespace) ?? {});
    done += progress.done;
    total += progress.total;
  }
  return { language: languageOf(locale), progress: { done, total }, isSource: locale === config.source };
}

const sorted = (map: Map<string, Messages>) => [...map].sort(([a], [b]) => a.localeCompare(b));

async function opened(store: Store, id: string) {
  const project = await store.project(id);
  if (!project) return null;
  const config = configOf(project);
  return { project, config, summary: summaryOf(project, config) };
}

async function viewerWork(store: Store, project: string, viewer: User | null, locale: string) {
  if (!viewer) return { edits: [] as Edit[], proposal: null as ProposalView | null };
  const [edits, proposal] = await Promise.all([
    store.edits(project, viewer.id, locale),
    store.proposal(project, viewer.id, locale),
  ]);
  return { edits, proposal: proposal ? { number: proposal.prNumber, url: proposal.prUrl } : null };
}

/** `/`. */
export async function homeView({ env, store, viewer }: Context): Promise<HomeView> {
  const projects = await store.projects();
  return {
    viewer: viewerOf(viewer),
    projects: projects.map((project) => summaryOf(project, configOf(project))),
    installUrl: installUrl(env),
  };
}

/** `/$owner/$repo`. */
export async function projectView({ store, viewer }: Context, id: string): Promise<ProjectView | null> {
  const found = await opened(store, id);
  if (!found) return null;
  const { config, summary } = found;
  const files = config ? await store.files(id) : [];
  const sources = config ? byNamespace(files, config.source) : new Map<string, Messages>();
  const locales = config ? [...new Set([config.source, ...config.locales])] : [];
  return {
    viewer: viewerOf(viewer),
    project: summary,
    repoUrl: `https://github.com/${id}`,
    locales: config ? locales.map((locale) => localeSummary(config, sources, files, locale)) : [],
  };
}

/** `/$owner/$repo/$locale`. */
export async function localeView({ store, viewer }: Context, id: string, locale: string): Promise<LocaleView | null> {
  const found = await opened(store, id);
  const config = found?.config;
  if (!found || !config || (locale !== config.source && !config.locales.includes(locale))) return null;
  const files = await store.files(id, [...new Set([config.source, locale])]);
  const sources = byNamespace(files, config.source);
  const target = byNamespace(files, locale);
  const { edits, proposal } = await viewerWork(store, id, viewer, locale);
  return {
    viewer: viewerOf(viewer),
    project: found.summary,
    locale: localeSummary(config, sources, files, locale),
    namespaces: sorted(sources).map(([namespace, source]) => ({
      namespace,
      progress: progressOf(rowsFor(source, locale), target.get(namespace) ?? {}),
      drafts: edits.filter((e) => e.namespace === namespace && !e.proposed).length,
    })),
    drafts: edits.filter((e) => !e.proposed).length,
    proposed: edits.filter((e) => e.proposed).length,
    proposal,
  };
}

/** `/$owner/$repo/$locale/$namespace`. */
export async function namespaceView(
  { store, viewer }: Context,
  id: string,
  locale: string,
  namespace: string,
): Promise<NamespaceView | null> {
  const found = await opened(store, id);
  const config = found?.config;
  if (!found || !config || (locale !== config.source && !config.locales.includes(locale))) return null;
  const references = config.references.filter((tag) => tag !== locale && tag !== config.source);
  const files = await store.files(id, [...new Set([config.source, locale, ...references])]);
  const sources = byNamespace(files, config.source);
  const source = sources.get(namespace);
  if (!source) return null;
  const target = byNamespace(files, locale).get(namespace) ?? {};
  const referenced = references.map((tag) => ({ language: languageOf(tag), messages: byNamespace(files, tag).get(namespace) ?? {} }));
  const { edits, proposal } = await viewerWork(store, id, viewer, locale);
  const editOf = new Map(edits.filter((e) => e.namespace === namespace).map((e) => [e.key, e]));
  const keys = new Set(Object.keys(source));
  const rows: RowView[] = rowsFor(source, locale).map((row) => {
    const edit = editOf.get(row.key);
    const current = target[row.key] ?? null;
    const shown = edit?.value ?? current ?? '';
    return {
      key: row.key,
      source: row.source,
      references: referenced.map(({ language, messages }) => ({ language, text: messages[row.key] ?? null })),
      current,
      draft: edit?.value ?? null,
      proposed: edit?.proposed ?? false,
      plural: row.plural,
      issues:
        shown.trim() === ''
          ? []
          : check(shown, { source: row.source, keys, plural: row.plural !== null }),
    };
  });
  return {
    viewer: viewerOf(viewer),
    project: found.summary,
    locale: localeSummary(config, sources, files, locale),
    namespace,
    rows,
    drafts: edits.filter((e) => !e.proposed).length,
    proposed: edits.filter((e) => e.proposed).length,
    proposal,
  };
}
