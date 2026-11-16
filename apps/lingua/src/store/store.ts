/** A repository Lingua translates, as its last sync left it. */
export interface Project {
  id: string;
  installationId: number;
  branch: string;
  config: string | null;
  configError: string | null;
  headSha: string | null;
  treeSha: string | null;
  syncedAt: number | null;
}

/** One catalog file as the default branch held it at the last sync. */
export interface FileRow {
  path: string;
  catalog: number;
  locale: string;
  namespace: string;
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
  namespace: string;
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

/** The rolling pull request one contributor has open for one language. */
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

/** What a sync learned about a project's default branch. */
export interface Synced {
  headSha: string;
  treeSha: string;
  config: string | null;
  configError: string | null;
  at: number;
}

/** Every read and write Lingua makes, so the rules can run against an in-memory stand-in. */
export interface Store {
  projects(): Promise<Project[]>;
  project(id: string): Promise<Project | null>;
  upsertProject(id: string, installationId: number, branch: string): Promise<void>;
  dropProjects(installationId: number, keep: readonly string[]): Promise<void>;
  setSynced(id: string, synced: Synced): Promise<void>;

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
  markProposed(project: string, userId: number, locale: string): Promise<void>;

  proposal(project: string, userId: number, locale: string): Promise<Proposal | null>;
  proposalByBranch(project: string, branch: string): Promise<Proposal | null>;
  saveProposal(proposal: Proposal): Promise<void>;
  closeProposal(proposal: Proposal): Promise<void>;

  holdSetupCode(code: string, now: number): Promise<void>;
}
