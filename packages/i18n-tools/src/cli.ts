import { run } from './run.ts';
import { REPO, workspace } from './workspace.ts';

try {
  process.exit(
    await run(process.argv.slice(2), {
      sets: workspace(),
      root: REPO,
      bin: 'bun run i18n',
      print: (text) => console.log(text),
    }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
