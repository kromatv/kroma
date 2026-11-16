import type { ListedProject } from '#site/github/pass';
import type { RepositoryStatus, SetupView, SyncState } from '#site/lib/views';
import type { Project } from '#site/store/store';
import { listedProjects, oauthCredentials } from './env';
import { asViewer, type Context } from './views';

function syncOf(project: Project): SyncState {
  if (project.syncError !== null) return { kind: 'failed', error: project.syncError };
  if (project.branchSha !== null && project.branchSha !== project.headSha) return { kind: 'reading', progress: project.progress };
  return project.headSha === null ? { kind: 'waiting' } : { kind: 'current' };
}

function statusOf(listed: ListedProject, project: Project | undefined): RepositoryStatus {
  if (!project) return { id: listed.id, branch: listed.branch, checkedAt: null, sync: { kind: 'waiting' }, configError: null };
  return { id: listed.id, branch: project.branch, checkedAt: project.checkedAt, sync: syncOf(project), configError: project.configError };
}

/** `/setup`: whether sign-in is configured, and where the sync of each repository `LINGUA_PROJECTS` lists stands. */
export async function setupView({ env, store, viewer }: Context, origin: string): Promise<SetupView> {
  const held = new Map((await store.projects()).map((p) => [p.id, p]));
  return {
    viewer: asViewer(viewer),
    origin,
    signIn: oauthCredentials(env) !== null,
    repositories: listedProjects(env).map((listed) => statusOf(listed, held.get(listed.id))),
  };
}
