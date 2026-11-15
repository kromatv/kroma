import { type Layout, layout } from './layout';
import { type MergedCoverage, mergeCoverage } from './merged-coverage';
import { type MutationRun, mutationRuns, mutatorArguments } from './mutate';
import { root } from './root';
import { streamTool } from './tool';
import { trackedFiles } from './tracked-files';

const SURVIVORS = 3;

interface Session {
  at: Layout;
  coverage: MergedCoverage;
  extra: string[];
}

async function mutate(run: MutationRun | undefined, session: Session): Promise<void> {
  if (run === undefined) {
    return;
  }
  const measured = run.files.some(session.coverage.measured);
  console.log(
    measured
      ? `${run.language}: mutating the lines the coverage report hits`
      : `${run.language}: no coverage report holds these files, so every site is run`,
  );
  const coverage = measured ? '--use-existing-coverage' : '--no-coverage';
  const code = await streamTool(
    session.at,
    'mutator',
    mutatorArguments(run, coverage, session.extra),
  );
  if (code === SURVIVORS) {
    console.log(`${run.language}: some mutants survived, the table above names them`);
  } else if (code !== 0) {
    throw new Error(`mutator exited ${code} on ${run.language}`);
  }
}

export async function main(argv: string[]): Promise<void> {
  const [path, ...extra] = argv;
  if (path === undefined) {
    throw new Error('usage: bun run quality:mutate <package path> [mutator options]');
  }
  const at = layout(root);
  const [first, second] = mutationRuns(path, await trackedFiles(at.root));
  const session = { at, coverage: mergeCoverage(at, []), extra };
  await mutate(first, session);
  await mutate(second, session);
}
