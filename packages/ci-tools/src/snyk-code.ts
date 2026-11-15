import { z } from 'zod';

/** The SARIF `snyk code test` writes, as far as its summary reads it. */
export const SnykCodeSarif = z.object({
  runs: z.array(
    z.object({
      results: z.array(
        z.object({ level: z.enum(['error', 'warning', 'note', 'none']).default('warning') }),
      ),
    }),
  ),
});
export type SnykCodeSarif = z.infer<typeof SnykCodeSarif>;

const SEVERITY = { error: 'high', warning: 'medium', note: 'low' } as const;

/** The run page's table for Snyk Code, whose SARIF levels stand for its three severities. */
export function codeSummary(log: SnykCodeSarif): string {
  const results = log.runs.flatMap((run) => run.results);
  const rows = Object.entries(SEVERITY).map(([level, severity]) => {
    const count = results.filter((result) => result.level === level).length;
    return `| ${severity} | ${count} |`;
  });
  return ['### Snyk Code', '', '| severity | findings |', '|---|---|', ...rows].join('\n');
}
