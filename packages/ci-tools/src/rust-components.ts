/** One module workspace's tests run as a component: how long it took, and whether it passed. */
export interface ComponentRun {
  id: string;
  seconds: number;
  passed: boolean;
}

/** The job summary: a row per workspace, with its wall time. */
export function componentTable(runs: readonly ComponentRun[]): string {
  const rows = runs.map(
    (run) => `| ${run.id} | ${Math.round(run.seconds)} s | ${run.passed ? 'passed' : 'failed'} |`,
  );
  return ['| workspace | wall time | result |', '|---|---|---|', ...rows].join('\n');
}
