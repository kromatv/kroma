import { z } from 'zod';
import { CONFIG_PATH, type LinguaConfig, parseConfig, placeOf, rootOf } from '#site/core/config';
import type { FileRow, Project, Store } from '#site/store/store';
import { type GitHub, GitHubError } from './client';

const Sha = z.string().regex(/^[0-9a-f]{40}$/);

const Branch = z.object({
  commit: z.object({ sha: Sha, commit: z.object({ tree: z.object({ sha: Sha }) }) }),
});

const TreeEntry = z.object({ path: z.string(), type: z.string(), sha: Sha });
type TreeEntry = z.infer<typeof TreeEntry>;

const Tree = z.object({ truncated: z.boolean(), tree: z.array(TreeEntry) });

const Blobs = z.object({
  repository: z.record(z.string(), z.object({ text: z.string().nullable().optional() }).nullable()),
});

const Installations = z.array(z.object({ id: z.number() }));

const Repositories = z.object({
  repositories: z.array(
    z.object({
      full_name: z.string(),
      default_branch: z.string(),
      archived: z.boolean().optional(),
    }),
  ),
});

const BATCH = 60;

/** Who a sync talks to and where it keeps what it read. */
export interface Syncing {
  gh: GitHub;
  store: Store;
}

/** The head of a branch: its commit and the tree under it. */
export async function headOf(
  gh: GitHub,
  repo: string,
  branch: string,
): Promise<{ sha: string; tree: string }> {
  const found = await gh.get(`/repos/${repo}/branches/${encodeURIComponent(branch)}`, Branch);
  return { sha: found.commit.sha, tree: found.commit.commit.tree.sha };
}

async function blobBatch(
  gh: GitHub,
  repo: string,
  oids: readonly string[],
): Promise<[string, string][]> {
  const [owner, name] = repo.split('/');
  const fields = oids
    .map((oid, i) => `b${i}: object(oid: "${Sha.parse(oid)}") { ... on Blob { text } }`)
    .join('\n');
  const data = await gh.graphql(
    `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`,
    Blobs,
    { owner, name },
  );
  return oids.flatMap((oid, i): [string, string][] => {
    const text = data.repository[`b${i}`]?.text;
    return typeof text === 'string' ? [[oid, text]] : [];
  });
}

/** The text of every blob in `oids`, read in batches through GraphQL so a sync costs a handful of requests. */
export async function blobTexts(
  gh: GitHub,
  repo: string,
  oids: readonly string[],
): Promise<Map<string, string>> {
  const batches = Array.from({ length: Math.ceil(oids.length / BATCH) }, (_, i) =>
    oids.slice(i * BATCH, (i + 1) * BATCH),
  );
  const answered = await Promise.all(batches.map((batch) => blobBatch(gh, repo, batch)));
  return new Map(answered.flat());
}

async function configAt(gh: GitHub, repo: string, tree: readonly TreeEntry[]) {
  const entry = tree.find((e) => e.path === CONFIG_PATH && e.type === 'blob');
  if (!entry) {
    return { config: null, text: null, error: `${CONFIG_PATH} is missing` };
  }
  const text = (await blobTexts(gh, repo, [entry.sha])).get(entry.sha) ?? '';
  const parsed = parseConfig(text);
  return parsed.ok
    ? { config: parsed.config, text, error: null }
    : { config: null, text: null, error: parsed.error };
}

function projectEntries(config: LinguaConfig | null, tree: readonly TreeEntry[]) {
  const root = config ? rootOf(config) : null;
  return tree.flatMap((entry) => {
    const place = root !== null && entry.type === 'blob' ? placeOf(root, entry.path) : null;
    return place ? [{ ...place, path: entry.path, sha: entry.sha }] : [];
  });
}

async function readTree(gh: GitHub, repo: string, tree: string) {
  const read = await gh.get(`/repos/${repo}/git/trees/${tree}?recursive=1`, Tree);
  if (read.truncated) {
    return {
      config: null,
      text: null,
      error: 'the repository tree is too large to read in one request',
      entries: [],
    };
  }
  const found = await configAt(gh, repo, read.tree);
  return { ...found, entries: projectEntries(found.config, read.tree) };
}

async function refreshFiles(
  { gh, store }: Syncing,
  repo: string,
  entries: ReturnType<typeof projectEntries>,
) {
  const held = await store.files(repo);
  const known = new Map(held.map((f) => [f.path, f.blobSha]));
  const changed = entries.filter((entry) => known.get(entry.path) !== entry.sha);
  const texts = await blobTexts(gh, repo, [...new Set(changed.map((e) => e.sha))]);
  const upserts = changed.flatMap((entry): FileRow[] => {
    const body = texts.get(entry.sha);
    const { sha, ...where } = entry;
    return body === undefined ? [] : [{ ...where, blobSha: sha, body }];
  });
  const present = new Set(entries.map((e) => e.path));
  await store.replaceFiles(
    repo,
    upserts,
    held.filter((f) => !present.has(f.path)).map((f) => f.path),
  );
}

/**
 * Bring a project's copy of its i18n folder level with its default branch:
 * read `lingua.json`, then fetch only the files whose blob changed since the
 * last sync. Returns whether anything moved.
 */
export async function syncProject(
  syncing: Syncing,
  project: Project,
  now: number,
): Promise<boolean> {
  const head = await headOf(syncing.gh, project.id, project.branch);
  if (head.sha === project.headSha) {
    return false;
  }
  const read = await readTree(syncing.gh, project.id, head.tree);
  await refreshFiles(syncing, project.id, read.entries);
  await syncing.store.setSynced(project.id, {
    headSha: head.sha,
    treeSha: head.tree,
    config: read.text,
    configError: read.error,
    at: now,
  });
  return true;
}

async function hasConfig(gh: GitHub, repo: string, branch: string): Promise<boolean> {
  try {
    await gh.get(
      `/repos/${repo}/contents/${CONFIG_PATH}?ref=${encodeURIComponent(branch)}`,
      z.unknown(),
    );
    return true;
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) {
      return false;
    }
    throw error;
  }
}

/** Record every repository an installation reaches that carries a `lingua.json`, and forget the rest. */
export async function discoverInstallation(
  { gh, store }: Syncing,
  installationId: number,
): Promise<void> {
  const { repositories } = await gh.get('/installation/repositories?per_page=100', Repositories);
  const live = repositories.filter((repo) => !repo.archived);
  const configured = await Promise.all(
    live.map((repo) => hasConfig(gh, repo.full_name, repo.default_branch)),
  );
  const kept = live.filter((_, i) => configured[i]);
  await Promise.all(
    kept.map((repo) => store.upsertProject(repo.full_name, installationId, repo.default_branch)),
  );
  await store.dropProjects(
    installationId,
    kept.map((repo) => repo.full_name),
  );
}

/** Every installation of the App, as the App itself lists them. */
export async function installations(app: GitHub): Promise<number[]> {
  return (await app.get('/app/installations?per_page=100', Installations)).map((i) => i.id);
}
