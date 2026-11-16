/** The route params of a project, from its `owner/repo` id. */
export function projectParams(id: string): { owner: string; repo: string } {
  const [owner = '', repo = ''] = id.split('/');
  return { owner, repo };
}

/** A project's `owner/repo` id, from its route params. */
export function projectId({ owner, repo }: { owner: string; repo: string }): string {
  return `${owner}/${repo}`;
}
