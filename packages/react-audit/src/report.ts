// A result as a person reads it. Kept separate from the reading itself so a
// caller can format its own without going through this.

import type { Result } from './record';

/** One line per component that did work, worst first. */
function formatResult(result: Result, limit = 12): string {
  const lines: string[] = [];
  const churned = result.churn.reduce((sum, [, count]) => sum + count, 0);

  lines.push(
    `${result.commits.length} commits  ${result.elementCount} elements  ${churned} churned  ${result.rerenders} re-rendered`,
  );
  if (result.churn.length > 0) {
    lines.push('', 'destroyed and rebuilt:');
    for (const [name, count] of result.churn.slice(0, limit)) {
      lines.push(`  ${String(count).padStart(5)}  ${name}`);
    }
  }
  const updated = result.components.filter(([, work]) => work.updated > 0);
  if (updated.length > 0) {
    lines.push('', 're-rendered:');
    for (const [name, work] of updated.slice(0, limit)) {
      lines.push(`  ${String(work.updated).padStart(5)}  ${name}`);
    }
  }
  return lines.join('\n');
}

export { formatResult };
