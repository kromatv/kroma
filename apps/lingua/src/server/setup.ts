import type { ListedProject } from '#site/github/pass';
import type { RepositoryStatus, SetupView } from '#site/lib/views';
import type { Project } from '#site/store/store';
import { listedProjects, oauthCredentials } from './env';
import { syncOf } from './sync-state';
import { asViewer, type Context } from './views';

/** Where the sync of a listed repository stands, from its project, or waiting when it has none yet. */
export function statusOf(listed: ListedProject, project: Project | undefined): RepositoryStatus {
  if (!project) {
    return {
      id: listed.id,
      branch: listed.branch,
      checkedAt: null,
      sync: { kind: 'waiting' },
      configError: null,
    };
  }
  return {
    id: listed.id,
    branch: project.branch,
    checkedAt: project.checkedAt,
    sync: syncOf(project),
    configError: project.configError,
  };
}

/** `/setup`: whether sign-in is configured, and where the sync of each repository `LINGUA_PROJECTS` lists stands. */
export async function setupView(
  { env, store, viewer }: Context,
  origin: string,
): Promise<SetupView> {
  const held = new Map((await store.projects()).map((p) => [p.id, p]));
  return {
    viewer: asViewer(viewer),
    origin,
    signIn: oauthCredentials(env) !== null,
    repositories: listedProjects(env).map((listed) => statusOf(listed, held.get(listed.id))),
  };
}
