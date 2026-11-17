import type {
  BranchHead,
  Checked,
  Confirm,
  Edit,
  EditKey,
  FileRow,
  Project,
  Proposal,
  Start,
  Store,
  Synced,
  Tracked,
  User,
} from './store';

const editId = (e: EditKey) => JSON.stringify([e.project, e.userId, e.locale, e.key]);
const proposalId = (project: string, userId: number, locale: string) =>
  JSON.stringify([project, userId, locale]);

type Pending = Edit | Confirm | Start;

const UNSYNCED = {
  config: null,
  configError: null,
  headSha: null,
  treeSha: null,
  syncedAt: null,
  branchSha: null,
  etag: null,
  progress: null,
  syncError: null,
  checkedAt: null,
};

/** The store held in memory, for tests and for a local run without D1. */
export class MemoryStore implements Store {
  private readonly held = {
    projects: new Map<string, Project>(),
    files: new Map<string, Map<string, FileRow>>(),
    users: new Map<number, User>(),
    sessions: new Map<string, { userId: number; expiresAt: number }>(),
    edits: new Map<string, Edit>(),
    confirms: new Map<string, Confirm>(),
    starts: new Map<string, Start>(),
    proposals: new Map<string, Proposal>(),
    leases: new Map<string, number>(),
  };

  private filesOf(project: string): Map<string, FileRow> {
    const existing = this.held.files.get(project);
    if (existing) {
      return existing;
    }
    const created = new Map<string, FileRow>();
    this.held.files.set(project, created);
    return created;
  }

  private update(id: string, change: Partial<Project>): void {
    const p = this.held.projects.get(id);
    if (p) {
      this.held.projects.set(id, { ...p, ...change });
    }
  }

  private editsWhere(match: (e: Edit) => boolean): [string, Edit][] {
    return [...this.held.edits].filter(([, e]) => match(e));
  }

  private forEachWork(
    where: { project: string; userId: number; locale: string; proposed?: boolean },
    act: (held: Map<string, Pending>, id: string, work: Pending) => void,
  ): void {
    const tables: Map<string, Pending>[] = [this.held.edits, this.held.confirms, this.held.starts];
    for (const held of tables) {
      for (const [id, work] of held) {
        const mine =
          work.project === where.project &&
          work.userId === where.userId &&
          work.locale === where.locale;
        if (mine && (where.proposed === undefined || work.proposed === where.proposed)) {
          act(held, id, work);
        }
      }
    }
  }

  async projects(): Promise<Project[]> {
    return [...this.held.projects.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  async project(id: string): Promise<Project | null> {
    return this.held.projects.get(id) ?? null;
  }

  async upsertProject(t: Tracked): Promise<void> {
    const existing = this.held.projects.get(t.id);
    const kept =
      existing?.branch === t.branch ? existing : { ...existing, etag: null, branchSha: null };
    this.held.projects.set(t.id, { ...UNSYNCED, ...kept, ...t });
  }

  async dropProjects(keep: readonly string[]): Promise<void> {
    for (const p of this.held.projects.values()) {
      if (!keep.includes(p.id)) {
        this.held.projects.delete(p.id);
        this.held.files.delete(p.id);
      }
    }
  }

  async setSynced(id: string, s: Synced): Promise<void> {
    this.update(id, {
      headSha: s.headSha,
      treeSha: s.treeSha,
      config: s.config,
      configError: s.configError,
      syncedAt: s.at,
      branchSha: s.headSha,
      etag: s.etag ?? null,
      progress: null,
    });
  }

  async setBranchHead(id: string, head: BranchHead): Promise<void> {
    this.update(id, { branchSha: head.sha, etag: head.etag, progress: head.progress });
  }

  async claimSync(id: string, now: number, until: number): Promise<Project | null> {
    const held = this.held.leases.get(id);
    const project = this.held.projects.get(id);
    if (!project || (held !== undefined && held > now)) {
      return null;
    }
    this.held.leases.set(id, until);
    return project;
  }

  async endSync(id: string, checked: Checked): Promise<void> {
    this.held.leases.delete(id);
    this.update(id, { checkedAt: checked.at, syncError: checked.error });
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
      .sort((a, b) => a.file.localeCompare(b.file) || a.key.localeCompare(b.key));
  }

  async putEdit(e: Edit): Promise<void> {
    this.held.edits.set(editId(e), e);
  }

  async deleteEdit(which: EditKey): Promise<void> {
    this.held.edits.delete(editId(which));
  }

  async confirms(project: string, userId: number, locale: string): Promise<Confirm[]> {
    return [...this.held.confirms.values()]
      .filter((c) => c.project === project && c.userId === userId && c.locale === locale)
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  async putConfirm(c: Confirm): Promise<void> {
    this.held.confirms.set(editId(c), c);
  }

  async starts(project: string, userId: number): Promise<Start[]> {
    return [...this.held.starts.values()]
      .filter((s) => s.project === project && s.userId === userId)
      .sort((a, b) => a.locale.localeCompare(b.locale));
  }

  async putStart(s: Start): Promise<void> {
    this.held.starts.set(proposalId(s.project, s.userId, s.locale), s);
  }

  async dropUnsent(project: string, userId: number, locale: string): Promise<void> {
    this.forEachWork({ project, userId, locale, proposed: false }, (held, id) => held.delete(id));
  }

  async markProposed(project: string, userId: number, locale: string): Promise<void> {
    this.forEachWork({ project, userId, locale }, (held, id, work) =>
      held.set(id, { ...work, proposed: true }),
    );
  }

  async proposal(project: string, userId: number, locale: string): Promise<Proposal | null> {
    return this.held.proposals.get(proposalId(project, userId, locale)) ?? null;
  }

  async proposalsOf(project: string): Promise<Proposal[]> {
    return [...this.held.proposals.values()]
      .filter((p) => p.project === project)
      .sort((a, b) => a.updatedAt - b.updatedAt);
  }

  async saveProposal(p: Proposal): Promise<void> {
    this.held.proposals.set(proposalId(p.project, p.userId, p.locale), p);
  }

  async closeProposal(p: Proposal): Promise<void> {
    const where = { project: p.project, userId: p.userId, locale: p.locale, proposed: true };
    this.forEachWork(where, (held, id) => held.delete(id));
    this.held.proposals.delete(proposalId(p.project, p.userId, p.locale));
  }
}

/** A fresh, empty store held in memory. */
export function memoryStore(): Store {
  return new MemoryStore();
}
