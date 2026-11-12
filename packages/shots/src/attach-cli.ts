import { attach, DEFAULT_REPO, githubContext, imageMarkdown } from './attach';

const USAGE = 'usage: bun run shots:attach <file...> [--repo <owner/name>]';

async function main(argv: string[]): Promise<void> {
  const at = argv.indexOf('--repo');
  const repo = at === -1 ? DEFAULT_REPO : argv[at + 1];
  const files = at === -1 ? argv : argv.filter((_, i) => i !== at && i !== at + 1);
  if (!repo || files.length === 0 || files.some((file) => file.startsWith('--'))) {
    throw new Error(USAGE);
  }
  const context = githubContext(repo);
  const links = await Promise.all(files.map((file) => attach(file, context)));
  for (const [i, file] of files.entries()) console.log(imageMarkdown(file, links[i] ?? ''));
}

try {
  await main(process.argv.slice(2));
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
