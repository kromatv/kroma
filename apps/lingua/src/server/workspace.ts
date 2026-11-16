import type { Project as Policy } from '@kromatv/i18n/model';
import { parseConfig, rootOf } from '#site/core/config';
import { type Baseline, digests } from '#site/core/lock';
import { parseNotes } from '#site/core/notes';
import { parsePolicy, policyLocales } from '#site/core/policy';
import { localeFiles, type Shelf, shelfOf } from '#site/core/shelf';
import { type Source, sourceOf } from '#site/core/source';
import type { Project, Store, User } from '#site/store/store';

/** A project's i18n folder as one viewer works on it: every language `i18n.json` lists, then the ones they started. */
export interface Workspace {
  root: string;
  policy: Policy;
  locales: string[];
  started: ReadonlySet<string>;
  notes: ReadonlyMap<string, string>;
}

/** A project, its workspace when it can be read, and why it cannot when it cannot. */
export interface Opened {
  project: Project;
  workspace: Workspace | null;
  error: string | null;
}

async function workspaceOf(store: Store, project: Project, viewer: User | null) {
  const parsed = project.config ? parseConfig(project.config) : null;
  if (!parsed?.ok) {
    return { workspace: null, error: project.configError ?? (parsed?.ok === false ? parsed.error : null) };
  }
  const own = await store.files(project.id, ['']);
  const policy = parsePolicy(own.find((f) => f.kind === 'policy')?.body);
  if (!policy.ok) {
    return { workspace: null, error: policy.error };
  }
  const listed = policyLocales(policy.policy);
  const starts = viewer ? await store.starts(project.id, viewer.id) : [];
  const started = starts.map((s) => s.locale).filter((locale) => !listed.includes(locale));
  const notes = parseNotes(own.find((f) => f.kind === 'notes')?.body);
  const root = rootOf(parsed.config);
  const workspace = { root, policy: policy.policy, locales: [...listed, ...started], started: new Set(started), notes };
  return { workspace, error: null };
}

/** The project `id` as `viewer` sees it, or null when Lingua does not know it. */
export async function openProject(store: Store, id: string, viewer: User | null): Promise<Opened | null> {
  const project = await store.project(id);
  return project ? { project, ...(await workspaceOf(store, project, viewer)) } : null;
}

/** What a page reads its messages from: the files of some languages, and the source with its digests. */
export interface Reading {
  shelf: Shelf;
  source: Source;
  against: Baseline;
}

/** Read the source and `locales` of a workspace out of the store. */
export async function readLocales(store: Store, at: { id: string; workspace: Workspace }, locales: readonly string[]): Promise<Reading> {
  const sourceLocale = at.workspace.policy.source;
  const files = await store.files(at.id, [...new Set([sourceLocale, ...locales])]);
  const shelf = shelfOf(at.workspace.root, files);
  const source = sourceOf(sourceLocale, localeFiles(shelf, sourceLocale));
  return { shelf, source, against: { source, digests: await digests(source.messages.values()) } };
}
