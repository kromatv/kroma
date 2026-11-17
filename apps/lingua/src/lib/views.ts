import type { Issue } from '#site/core/checks';

export type { Issue };

/** The signed-in contributor, as the header shows them. */
export interface Viewer {
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

/** How many of the messages a language owes it already says. */
export interface Progress {
  done: number;
  total: number;
}

/** How far a language has come in the project's `i18n.json`: a `draft` is offered to no reader yet. */
export type Stage = 'draft' | 'beta' | 'stable';

/** Where a message stands in a language: `outdated` when the source moved since it was translated, `unreviewed` when a machine wrote it. */
export type RowState = 'missing' | 'translated' | 'outdated' | 'unreviewed';

/** How many messages stand in each state. */
export type StateCounts = Record<RowState, number>;

/** A language, named in English and in itself. */
export interface Language {
  tag: string;
  name: string;
  nativeName: string;
}

/**
 * A repository Lingua translates, on the branch it tracks. `error` is why its
 * `lingua.json` could not be read; `syncedAt` is in seconds; `sync` is where
 * reading its branch stands.
 */
export interface ProjectSummary {
  id: string;
  branch: string;
  source: Language | null;
  locales: number;
  syncedAt: number | null;
  error: string | null;
  sync: SyncState;
}

/** `/`: every project, and who is looking. */
export interface HomeView {
  viewer: Viewer | null;
  projects: ProjectSummary[];
}

/** One language of a project, with how far along it is. `started` is a language only the viewer has, until they send it. */
export interface LocaleSummary {
  language: Language;
  stage: Stage;
  progress: Progress;
  states: StateCounts;
  isSource: boolean;
  started: boolean;
}

/** `/$owner/$repo`: a project's languages. */
export interface ProjectView {
  viewer: Viewer | null;
  project: ProjectSummary;
  repoUrl: string;
  locales: LocaleSummary[];
}

/** One catalog file of a language (`nav`, `admin/backup`), with how far along it is and how many unsent edits the viewer holds there. */
export interface NamespaceSummary {
  file: string;
  progress: Progress;
  states: StateCounts;
  drafts: number;
}

/** The viewer's open pull request for a language. */
export interface ProposalView {
  number: number;
  url: string;
}

/** `/$owner/$repo/$locale`: a language's namespaces, and what the viewer has to send. */
export interface LocaleView {
  viewer: Viewer | null;
  project: ProjectSummary;
  locale: LocaleSummary;
  namespaces: NamespaceSummary[];
  drafts: number;
  proposed: number;
  proposal: ProposalView | null;
}

/** A reference language's text for one message, null where it has none. */
export interface Reference {
  language: Language;
  text: string | null;
}

/**
 * One message to translate. `current` is what the default branch says,
 * `draft` the viewer's unsent or proposed edit, `plural` the CLDR category the
 * message renders (null when it is not a plural form), `notes` what the
 * project tells translators about it, most specific last, and `confirmed`
 * whether the viewer holds a confirm of it.
 */
export interface RowView {
  key: string;
  source: string;
  references: Reference[];
  current: string | null;
  draft: string | null;
  proposed: boolean;
  plural: string | null;
  issues: Issue[];
  state: RowState;
  notes: string[];
  confirmed: boolean;
}

/** `/$owner/$repo/$locale/$file`: every message of one catalog file in one language. */
export interface NamespaceView {
  viewer: Viewer | null;
  project: ProjectSummary;
  locale: LocaleSummary;
  file: string;
  rows: RowView[];
  drafts: number;
  proposed: number;
  proposal: ProposalView | null;
}

/** One unsent catalog file of a contribution, and how many of the viewer's edits wait there. */
export interface ContributedFile {
  file: string;
  drafts: number;
}

/**
 * One language of one project the viewer has work in: changes not sent yet
 * (`drafts`, with the files their edits are in), or changes waiting in their
 * open pull request (`proposed`). `started` is a language only the viewer has.
 */
export interface Contribution {
  project: string;
  language: Language;
  started: boolean;
  drafts: number;
  proposed: number;
  proposal: ProposalView | null;
  files: ContributedFile[];
}

/** `/contributions`: the signed-in viewer's work in every project and language, none for a visitor. */
export interface ContributionsView {
  viewer: Viewer | null;
  contributions: Contribution[];
}

/** What every page's chrome needs: the address this deployment answers on, whether anyone can sign in, and who did. */
export interface SiteView {
  origin: string;
  signIn: boolean;
  viewer: Viewer | null;
}

/** A project as the command menu offers it: where it is, and the languages the viewer can open in it. */
export interface IndexedProject {
  id: string;
  languages: Language[];
}

/** One message a search across a language found: where it lives, what the source says and what the language says. */
export interface MessageHit {
  key: string;
  file: string;
  source: string;
  text: string | null;
}

/**
 * Where a repository's sync stands: never read yet, reading the files its
 * branch changed (`progress` once a pass counted them), holding the branch
 * head, or stopped by `error` at its last pass.
 */
export type SyncState =
  | { kind: 'waiting' }
  | { kind: 'reading'; progress: Progress | null }
  | { kind: 'current' }
  | { kind: 'failed'; error: string };

/**
 * One repository `LINGUA_PROJECTS` lists, as `/setup` shows it: the branch it
 * tracks (null until GitHub named its default one), when its last pass ended,
 * in seconds, its sync, and why its `lingua.json` could not be read.
 */
export interface RepositoryStatus {
  id: string;
  branch: string | null;
  checkedAt: number | null;
  sync: SyncState;
  configError: string | null;
}

/** `/setup`: whether people can sign in, and how each listed repository syncs. */
export interface SetupView {
  viewer: Viewer | null;
  origin: string;
  signIn: boolean;
  repositories: RepositoryStatus[];
}
