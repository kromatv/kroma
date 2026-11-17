import type { Place } from '#site/core/config';

/** How many of the files that changed at a branch head a sync has stored so far. */
export interface Progress {
  done: number;
  total: number;
}

/**
 * A repository Lingua translates, as its last sync left it. `headSha` is the
 * commit every stored file was read at; `branchSha` is where the branch stood
 * at the last check, with the `etag` GitHub sent for it, and `progress` counts
 * the files read toward it while it is ahead of `headSha`. `pinned` says the
 * branch came from `LINGUA_PROJECTS` rather than from the repository's default.
 */
export interface Project {
  id: string;
  branch: string;
  pinned: boolean;
  config: string | null;
  configError: string | null;
  headSha: string | null;
  treeSha: string | null;
  syncedAt: number | null;
  branchSha: string | null;
  etag: string | null;
  progress: Progress | null;
  syncError: string | null;
  checkedAt: number | null;
}

/** Which branch of a repository a project tracks, and whether `LINGUA_PROJECTS` pinned it. */
export type Tracked = Pick<Project, 'id' | 'branch' | 'pinned'>;

/** One file of a project's i18n folder as the default branch held it at the last sync. */
export interface FileRow extends Place {
  path: string;
  blobSha: string;
  body: string;
}

/** A GitHub account that signed in. */
export interface User {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

/** One message a contributor changed, kept until a pull request carrying it closes. */
export interface Edit {
  project: string;
  userId: number;
  locale: string;
  file: string;
  key: string;
  value: string;
  proposed: boolean;
  updatedAt: number;
}

/** Which edit: one contributor's one message in one language of one project. */
export interface EditKey {
  project: string;
  userId: number;
  locale: string;
  key: string;
}

/** A message a contributor says reads right as it is, kept until a pull request carrying it closes. */
export interface Confirm {
  project: string;
  userId: number;
  locale: string;
  key: string;
  proposed: boolean;
  updatedAt: number;
}

/** A language a contributor started, theirs alone until a pull request carrying it merges. */
export interface Start {
  project: string;
  userId: number;
  locale: string;
  proposed: boolean;
  createdAt: number;
}

/**
 * The rolling pull request one contributor has open for one language. `branch`
 * is its head as Lingua names it: a branch of the project, or
 * `<owner>:<branch>` for a branch of the contributor's fork.
 */
export interface Proposal {
  project: string;
  userId: number;
  locale: string;
  branch: string;
  prNumber: number;
  prUrl: string;
  headSha: string;
  updatedAt: number;
}

/** A branch head whose every changed file is stored, and the `etag` GitHub sent with it, when it sent one. */
export interface Synced {
  headSha: string;
  treeSha: string;
  config: string | null;
  configError: string | null;
  at: number;
  etag?: string | null;
}

/** Where a branch stood at a check, and how far the stored files have come toward it: `progress` is null once they hold it. */
export interface BranchHead {
  sha: string;
  etag: string | null;
  progress: Progress | null;
}

/** How a pass ended: when, and the error that stopped it. */
export interface Checked {
  at: number;
  error: string | null;
}

/** Every read and write Lingua makes, so the rules can run against an in-memory stand-in. */
export interface Store {
  projects(): Promise<Project[]>;
  project(id: string): Promise<Project | null>;
  upsertProject(tracked: Tracked): Promise<void>;
  dropProjects(keep: readonly string[]): Promise<void>;
  setSynced(id: string, synced: Synced): Promise<void>;
  setBranchHead(id: string, head: BranchHead): Promise<void>;
  claimSync(id: string, now: number, until: number): Promise<Project | null>;
  endSync(id: string, checked: Checked): Promise<void>;

  files(project: string, locales?: readonly string[]): Promise<FileRow[]>;
  replaceFiles(
    project: string,
    upserts: readonly FileRow[],
    removed: readonly string[],
  ): Promise<void>;

  upsertUser(user: User, now: number): Promise<void>;
  createSession(hash: string, userId: number, expiresAt: number): Promise<void>;
  sessionUser(hash: string, now: number): Promise<User | null>;
  deleteSession(hash: string): Promise<void>;

  edits(project: string, userId: number, locale: string): Promise<Edit[]>;
  putEdit(edit: Edit): Promise<void>;
  deleteEdit(which: EditKey): Promise<void>;
  confirms(project: string, userId: number, locale: string): Promise<Confirm[]>;
  putConfirm(confirm: Confirm): Promise<void>;
  starts(project: string, userId: number): Promise<Start[]>;
  putStart(start: Start): Promise<void>;
  dropUnsent(project: string, userId: number, locale: string): Promise<void>;
  markProposed(project: string, userId: number, locale: string): Promise<void>;

  proposal(project: string, userId: number, locale: string): Promise<Proposal | null>;
  proposalsOf(project: string): Promise<Proposal[]>;
  saveProposal(proposal: Proposal): Promise<void>;
  closeProposal(proposal: Proposal): Promise<void>;
}
