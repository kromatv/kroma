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

/** One language of a project, with how far along it is. */
export interface LocaleSummary {
  language: Language;
  progress: Progress;
  isSource: boolean;
}

/** `/$owner/$repo`: a project's languages. */
export interface ProjectView {
  viewer: Viewer | null;
  project: ProjectSummary;
  repoUrl: string;
  locales: LocaleSummary[];
}

/** One namespace of a language, with how far along it is and how many unsent edits the viewer holds there. */
export interface NamespaceSummary {
  namespace: string;
  progress: Progress;
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
 * message renders (null when it is not a plural form).
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
}

/** `/$owner/$repo/$locale/$namespace`: every message of one namespace in one language. */
export interface NamespaceView {
  viewer: Viewer | null;
  project: ProjectSummary;
  locale: LocaleSummary;
  namespace: string;
  rows: RowView[];
  drafts: number;
  proposed: number;
  proposal: ProposalView | null;
}
