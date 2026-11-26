import { clipCommand } from './clip-command';

const REPO_DIR = new URL('../../../..', import.meta.url).pathname;

try {
  process.exitCode = await clipCommand(REPO_DIR, process.argv.slice(2), process.env);
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
