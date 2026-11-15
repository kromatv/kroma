import { z } from 'zod';

const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

const Vulnerability = z.object({
  id: z.string().nonempty(),
  severity: z.enum(SEVERITIES),
  fixedIn: z.array(z.string()).default([]),
});

const Project = z.object({
  displayTargetFile: z.string().nonempty(),
  vulnerabilities: z.array(Vulnerability),
});

/** `snyk test --json`: an array with a project per workspace, or the one project alone. */
export const DependencyReport = z
  .union([z.array(Project), Project])
  .transform((report) => (Array.isArray(report) ? report : [report]));
export type DependencyReport = z.infer<typeof DependencyReport>;

const Rule = z.looseObject({ id: z.string().nonempty() });

const Result = z.looseObject({
  ruleId: z.string().nonempty(),
  ruleIndex: z.number().int().optional(),
  level: z.enum(['error', 'warning', 'note', 'none']).default('warning'),
});

const Run = z.looseObject({
  tool: z.looseObject({
    driver: z.looseObject({ name: z.string(), rules: z.array(Rule).default([]) }),
  }),
  results: z.array(Result),
});

/** A SARIF log, keeping every field it does not name. */
export const SarifLog = z.looseObject({ runs: z.array(Run) });
export type SarifLog = z.infer<typeof SarifLog>;

const withoutIndex = ({ ruleIndex: _stale, ...result }: z.infer<typeof Result>) => result;

/**
 * The runs of one tool joined into one, each rule listed once. Snyk writes a
 * run per workspace, and code scanning refuses a file holding several runs of
 * the same tool under one category.
 */
export function oneRun(log: SarifLog): SarifLog {
  const [first, ...rest] = log.runs;
  if (first === undefined || rest.length === 0) {
    return log;
  }
  const rules = new Map(
    log.runs.flatMap((run) => run.tool.driver.rules).map((rule) => [rule.id, rule]),
  );
  const driver = { ...first.tool.driver, rules: [...rules.values()] };
  const results = log.runs.flatMap((run) => run.results.map(withoutIndex));
  return { ...log, runs: [{ tool: { ...first.tool, driver }, results }] };
}

/** The run page's table for the dependency scan, an advisory counted once across workspaces. */
export function dependencySummary(report: DependencyReport): string {
  const advisories = [
    ...new Map(
      report.flatMap((project) => project.vulnerabilities).map((found) => [found.id, found]),
    ).values(),
  ];
  const rows = SEVERITIES.map((severity) => {
    const found = advisories.filter((advisory) => advisory.severity === severity);
    const fixed = found.filter((advisory) => advisory.fixedIn.length > 0);
    return `| ${severity} | ${found.length} | ${fixed.length} |`;
  });
  return [
    '### Snyk Open Source',
    '',
    `${report.length} workspaces, ${advisories.length} advisories.`,
    '',
    '| severity | advisories | with a fixed version |',
    '|---|---|---|',
    ...rows,
  ].join('\n');
}

const CODE_SEVERITY = { error: 'high', warning: 'medium', note: 'low' } as const;

/** The run page's table for Snyk Code, whose SARIF levels stand for its three severities. */
export function codeSummary(log: SarifLog): string {
  const results = log.runs.flatMap((run) => run.results);
  const rows = Object.entries(CODE_SEVERITY).map(([level, severity]) => {
    const count = results.filter((result) => result.level === level).length;
    return `| ${severity} | ${count} |`;
  });
  return ['### Snyk Code', '', '| severity | findings |', '|---|---|', ...rows].join('\n');
}
