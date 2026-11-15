import { z } from 'zod';

const SEVERITIES = ['critical', 'high', 'moderate', 'low'] as const;
type Severity = (typeof SEVERITIES)[number];

const Advisory = z.object({
  id: z.number().int(),
  url: z.url(),
  title: z.string().nonempty(),
  severity: z.enum(SEVERITIES),
  vulnerable_versions: z.string(),
  cwe: z.array(z.string()).default([]),
});
type Advisory = z.infer<typeof Advisory>;

/** `bun audit --json`: the advisories against the packages in `bun.lock`, by package name. */
export const BunAudit = z.record(z.string(), z.array(Advisory));
export type BunAudit = z.infer<typeof BunAudit>;

const LEVEL: Record<Severity, string> = {
  critical: 'error',
  high: 'error',
  moderate: 'warning',
  low: 'note',
};

const SECURITY_SEVERITY: Record<Severity, string> = {
  critical: '9.0',
  high: '7.0',
  moderate: '4.0',
  low: '0.1',
};

const ruleId = (advisory: Advisory) => advisory.url.split('/').at(-1) ?? String(advisory.id);

const rule = (advisory: Advisory) => ({
  id: ruleId(advisory),
  shortDescription: { text: advisory.title },
  helpUri: advisory.url,
  properties: {
    tags: ['security', ...advisory.cwe],
    'security-severity': SECURITY_SEVERITY[advisory.severity],
  },
});

/** The 1-based line of the package's first entry in a text `bun.lock`, or 1 when it has none. */
export function lockLine(lock: string, name: string): number {
  const index = lock.split('\n').findIndex((line) => line.includes(`": ["${name}@`));
  return index + 1 || 1;
}

/**
 * The audit as one SARIF run for code scanning, each finding placed on the
 * package's entry in `bun.lock` so an alert keeps its place between runs.
 */
export function auditSarif(audit: BunAudit, lock: string) {
  const found = Object.entries(audit).flatMap(([name, advisories]) =>
    advisories.map((advisory) => ({ name, advisory })),
  );
  const rules = new Map(found.map(({ advisory }) => [ruleId(advisory), rule(advisory)]));
  const results = found.map(({ name, advisory }) => ({
    ruleId: ruleId(advisory),
    level: LEVEL[advisory.severity],
    message: { text: `${name} ${advisory.vulnerable_versions}: ${advisory.title}` },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: 'bun.lock' },
          region: { startLine: lockLine(lock, name) },
        },
      },
    ],
  }));
  return {
    version: '2.1.0',
    runs: [{ tool: { driver: { name: 'bun audit', rules: [...rules.values()] } }, results }],
  };
}

/** The run page's table: advisories by severity, and how many packages carry them. */
export function auditSummary(audit: BunAudit): string {
  const advisories = Object.values(audit).flat();
  const rows = SEVERITIES.map((severity) => {
    const count = advisories.filter((advisory) => advisory.severity === severity).length;
    return `| ${severity} | ${count} |`;
  });
  return [
    '### Dependency advisories',
    '',
    `${advisories.length} advisories in ${Object.keys(audit).length} packages (bun audit).`,
    '',
    '| severity | advisories |',
    '|---|---|',
    ...rows,
  ].join('\n');
}
