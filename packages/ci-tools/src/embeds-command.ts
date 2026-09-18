import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { embeds, uncovered, warmUpCopies } from './embeds';
import { root } from './root';

const CRATES = ['server/crates', 'modules'];

async function rustSources(): Promise<Record<string, string>> {
  const glob = new Bun.Glob('**/*.rs');
  const sources: Record<string, string> = {};
  for (const dir of CRATES) {
    for await (const file of glob.scan({ cwd: join(root, dir), onlyFiles: true })) {
      if (file.includes('/target/') || file.includes('/ui/')) continue;
      const path = `${dir}/${file}`;
      sources[path] = await readFile(join(root, path), 'utf8');
    }
  }
  return sources;
}

/**
 * `bun run ci embeds`: the server Dockerfile compiles the workspace once with
 * a stub main to warm its dependency cache, and a crate that embeds a file
 * under `packages/` at compile time needs that file copied before then. This
 * fails when one is not, naming it, so the image never breaks on a deploy.
 */
export async function main(): Promise<void> {
  const dockerfile = await readFile(join(root, 'server/Dockerfile'), 'utf8');
  const copies = warmUpCopies(dockerfile);
  const missing = uncovered(embeds(await rustSources()), copies);
  if (missing.length === 0) {
    console.log(
      `every compile-time embed is in place for the warm-up build (${copies.length} copies)`,
    );
    return;
  }
  for (const e of missing)
    console.error(
      `::error file=${e.from}::embeds ${e.path}, which no warm-up COPY in server/Dockerfile puts in place`,
    );
  throw new Error(`${missing.length} embed(s) missing from the Dockerfile warm-up stage`);
}
