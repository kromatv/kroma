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

/** A repository Lingua translates. `error` is why its `lingua.json` could not be read; `syncedAt` is in seconds. */
export interface ProjectSummary {
  id: string;
  source: Language | null;
  locales: number;
  syncedAt: number | null;
  error: string | null;
}

/** `/`: every project, and who is looking. */
export interface HomeView {
  viewer: Viewer | null;
  projects: ProjectSummary[];
  installUrl: string | null;
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

/** What every page's chrome needs: the address this deployment answers on, and whether anyone can sign in. */
export interface SiteView {
  origin: string;
  signIn: boolean;
}

/** An account a GitHub App can be created under: the operator's own, or an organisation they administer. */
export interface AppOwner {
  login: string;
  avatarUrl: string | null;
  kind: 'user' | 'organization';
}

/**
 * `/setup`: what this deployment has connected to GitHub. `manifest` is the
 * App's manifest as GitHub's form takes it, `owners` the accounts the operator
 * may create it under (empty until they let Lingua list them), `repositories`
 * how many the App syncs, and `code` the one GitHub returned with, while it
 * still waits to be traded for the App's secrets.
 */
export interface SetupView {
  viewer: Viewer | null;
  origin: string;
  app: boolean;
  signIn: boolean;
  installUrl: string | null;
  repositories: number;
  manifest: string;
  owners: AppOwner[];
  code: string | null;
}
