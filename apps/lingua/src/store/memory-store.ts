import type { Edit, EditKey, FileRow, Project, Proposal, Store, Synced, User } from './store';

const editId = (e: EditKey) => JSON.stringify([e.project, e.userId, e.locale, e.key]);
const proposalId = (project: string, userId: number, locale: string) =>
  JSON.stringify([project, userId, locale]);

const UNSYNCED = { config: null, configError: null, headSha: null, treeSha: null, syncedAt: null };

/** The store held in memory, for tests and for a local run without D1. */
export class MemoryStore implements Store {
  private readonly held = {
    projects: new Map<string, Project>(),
    files: new Map<string, Map<string, FileRow>>(),
    users: new Map<number, User>(),
    sessions: new Map<string, { userId: number; expiresAt: number }>(),
    edits: new Map<string, Edit>(),
    proposals: new Map<string, Proposal>(),
    setupCodes: new Map<string, number>(),
  };

  /** The setup codes held, newest first. */
  get setupCodes(): string[] {
    return [...this.held.setupCodes].sort(([, a], [, b]) => b - a).map(([code]) => code);
  }

  private filesOf(project: string): Map<string, FileRow> {
    const existing = this.held.files.get(project);
    if (existing) {
      return existing;
    }
    const created = new Map<string, FileRow>();
    this.held.files.set(project, created);
    return created;
  }

  private editsWhere(match: (e: Edit) => boolean): [string, Edit][] {
    return [...this.held.edits].filter(([, e]) => match(e));
  }

  async projects(): Promise<Project[]> {
    return [...this.held.projects.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  async project(id: string): Promise<Project | null> {
    return this.held.projects.get(id) ?? null;
  }

  async upsertProject(id: string, installationId: number, branch: string): Promise<void> {
    const existing = this.held.projects.get(id) ?? UNSYNCED;
    this.held.projects.set(id, { ...existing, id, installationId, branch });
  }

  async dropProjects(installationId: number, keep: readonly string[]): Promise<void> {
    for (const p of this.held.projects.values()) {
      if (p.installationId === installationId && !keep.includes(p.id)) {
        this.held.projects.delete(p.id);
        this.held.files.delete(p.id);
      }
    }
  }

  async setSynced(id: string, s: Synced): Promise<void> {
    const p = this.held.projects.get(id);
    if (p) {
      this.held.projects.set(id, {
        ...p,
        headSha: s.headSha,
        treeSha: s.treeSha,
        config: s.config,
        configError: s.configError,
        syncedAt: s.at,
      });
    }
  }

  async files(project: string, locales?: readonly string[]): Promise<FileRow[]> {
    return [...this.filesOf(project).values()].filter(
      (f) => !locales || locales.includes(f.locale),
    );
  }

  async replaceFiles(
    project: string,
    upserts: readonly FileRow[],
    removed: readonly string[],
  ): Promise<void> {
    const held = this.filesOf(project);
    for (const f of upserts) {
      held.set(f.path, f);
    }
    for (const path of removed) {
      held.delete(path);
    }
  }

  async upsertUser(u: User): Promise<void> {
    this.held.users.set(u.id, u);
  }

  async createSession(hash: string, userId: number, expiresAt: number): Promise<void> {
    this.held.sessions.set(hash, { userId, expiresAt });
  }

  async sessionUser(hash: string, now: number): Promise<User | null> {
    const session = this.held.sessions.get(hash);
    return session && session.expiresAt > now
      ? (this.held.users.get(session.userId) ?? null)
      : null;
  }

  async deleteSession(hash: string): Promise<void> {
    this.held.sessions.delete(hash);
  }

  async edits(project: string, userId: number, locale: string): Promise<Edit[]> {
    return this.editsWhere(
      (e) => e.project === project && e.userId === userId && e.locale === locale,
    )
      .map(([, e]) => e)
      .sort((a, b) => a.namespace.localeCompare(b.namespace) || a.key.localeCompare(b.key));
  }

  async putEdit(e: Edit): Promise<void> {
    this.held.edits.set(editId(e), e);
  }

  async deleteEdit(which: EditKey): Promise<void> {
    this.held.edits.delete(editId(which));
  }

  async markProposed(project: string, userId: number, locale: string): Promise<void> {
    const mine = (held: Edit) =>
      held.project === project && held.userId === userId && held.locale === locale;
    for (const [id, e] of this.editsWhere(mine)) {
      this.held.edits.set(id, { ...e, proposed: true });
    }
  }

  async proposal(project: string, userId: number, locale: string): Promise<Proposal | null> {
    return this.held.proposals.get(proposalId(project, userId, locale)) ?? null;
  }

  async proposalByBranch(project: string, branch: string): Promise<Proposal | null> {
    return (
      [...this.held.proposals.values()].find((p) => p.project === project && p.branch === branch) ??
      null
    );
  }

  async saveProposal(p: Proposal): Promise<void> {
    this.held.proposals.set(proposalId(p.project, p.userId, p.locale), p);
  }

  async closeProposal(p: Proposal): Promise<void> {
    const sent = (e: Edit) =>
      e.project === p.project && e.userId === p.userId && e.locale === p.locale && e.proposed;
    for (const [id] of this.editsWhere(sent)) {
      this.held.edits.delete(id);
    }
    this.held.proposals.delete(proposalId(p.project, p.userId, p.locale));
  }

  async holdSetupCode(code: string, now: number): Promise<void> {
    this.held.setupCodes.set(code, now);
  }
}

/** A fresh, empty store held in memory. */
export function memoryStore(): Store {
  return new MemoryStore();
}
