import { z } from 'zod';
import { type GitHub, unlessMissing } from './client';

const Sha = z.string().regex(/^[0-9a-f]{40}$/);
const Ref = z.object({ object: z.object({ sha: Sha }) });
const Commit = z.object({ sha: Sha, tree: z.object({ sha: Sha }) });
const Paths = z.object({
  repository: z.record(z.string(), z.object({ oid: Sha.optional() }).nullable()),
});
const Blobs = z.object({
  repository: z.record(z.string(), z.object({ text: z.string().nullable().optional() }).nullable()),
});

const BATCH = 60;

/** One repository, through one GitHub client. */
export interface At {
  gh: GitHub;
  repo: string;
}

/** A commit and the tree under it. */
export interface Head {
  sha: string;
  tree: string;
}

/** The commit a branch points at, or null when there is no such branch. */
export async function refHead(at: At, branch: string): Promise<string | null> {
  const ref = await unlessMissing(at.gh.get(`/repos/${at.repo}/git/ref/heads/${branch}`, Ref));
  return ref?.object.sha ?? null;
}

/** Merge `head` into `branch`, and return where the branch then stands. */
export async function catchUp(at: At, branch: string, head: string): Promise<Head> {
  const message = `Merge the default branch into ${branch}`;
  await at.gh.send(
    {
      method: 'POST',
      path: `/repos/${at.repo}/merges`,
      body: { base: branch, head, commit_message: message },
    },
    z.unknown(),
  );
  const sha = await refHead(at, branch);
  if (!sha) {
    throw new Error(`branch ${branch} vanished`);
  }
  const commit = await at.gh.get(`/repos/${at.repo}/git/commits/${sha}`, Commit);
  return { sha, tree: commit.tree.sha };
}

async function oidsAt(at: At, sha: string, paths: readonly string[]): Promise<[string, string][]> {
  const [owner, name] = at.repo.split('/');
  const fields = paths.map((path, i) => {
    const expression = JSON.stringify(sha + ':' + path);
    return `p${i}: object(expression: ${expression}) { ... on Blob { oid } }`;
  });
  const query = `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields.join('\n')} } }`;
  const data = await at.gh.graphql(query, Paths, { owner, name });
  return paths.flatMap((path, i): [string, string][] => {
    const oid = data.repository[`p${i}`]?.oid;
    return oid ? [[path, oid]] : [];
  });
}

async function blobBatch(at: At, oids: readonly string[]): Promise<[string, string][]> {
  const [owner, name] = at.repo.split('/');
  const fields = oids
    .map((oid, i) => `b${i}: object(oid: "${Sha.parse(oid)}") { ... on Blob { text } }`)
    .join('\n');
  const data = await at.gh.graphql(
    `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`,
    Blobs,
    { owner, name },
  );
  return oids.flatMap((oid, i): [string, string][] => {
    const text = data.repository[`b${i}`]?.text;
    return typeof text === 'string' ? [[oid, text]] : [];
  });
}

async function blobTexts(at: At, oids: readonly string[]): Promise<Map<string, string>> {
  const batches = Array.from({ length: Math.ceil(oids.length / BATCH) }, (_, i) =>
    oids.slice(i * BATCH, (i + 1) * BATCH),
  );
  const answered = await Promise.all(batches.map((batch) => blobBatch(at, batch)));
  return new Map(answered.flat());
}

/** The text of each of `paths` that commit `sha` holds, reading only blobs `known` does not already have. */
export async function textsAt(
  at: At,
  sha: string,
  read: { paths: readonly string[]; known: ReadonlyMap<string, string> },
): Promise<Map<string, string>> {
  const oids = await oidsAt(at, sha, read.paths);
  const missing = [...new Set(oids.map(([, oid]) => oid).filter((oid) => !read.known.has(oid)))];
  const fetched = await blobTexts(at, missing);
  return new Map(
    oids.flatMap(([path, oid]): [string, string][] => {
      const text = read.known.get(oid) ?? fetched.get(oid);
      return text === undefined ? [] : [[path, text]];
    }),
  );
}
