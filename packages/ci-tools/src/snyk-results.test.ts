import { describe, expect, it } from 'vitest';
import { codeSummary, DependencyReport, dependencySummary, oneRun, SarifLog } from './snyk-results';

const run = (workspace: string, ...ids: string[]) => ({
  tool: { driver: { name: 'Snyk Open Source', rules: ids.map((id) => ({ id })) } },
  automationDetails: { id: `Snyk/Open Source/${workspace}` },
  results: ids.map((ruleId, ruleIndex) => ({
    ruleId,
    ruleIndex,
    level: 'error',
    locations: [{ physicalLocation: { artifactLocation: { uri: `${workspace}/package.json` } } }],
  })),
});

const project = (file: string, ...found: [id: string, severity: string, fixedIn: string[]][]) => ({
  displayTargetFile: file,
  vulnerabilities: found.map(([id, severity, fixedIn]) => ({ id, severity, fixedIn })),
});

describe('oneRun', () => {
  it('joins every workspace run into one, each rule listed once and no stale rule index', () => {
    const log = SarifLog.parse({
      version: '2.1.0',
      runs: [run('apps/kit', 'SNYK-A', 'SNYK-B'), run('clients/mobile', 'SNYK-B')],
    });

    const [merged, ...rest] = oneRun(log).runs;

    expect(rest).toEqual([]);
    expect(merged?.tool.driver.rules.map((rule) => rule.id)).toEqual(['SNYK-A', 'SNYK-B']);
    expect(merged?.results.map((result) => result.ruleId)).toEqual(['SNYK-A', 'SNYK-B', 'SNYK-B']);
    expect(merged?.results.some((result) => 'ruleIndex' in result)).toBe(false);
    expect(merged).not.toHaveProperty('automationDetails');
    expect(oneRun(log)).toHaveProperty('version', '2.1.0');
  });

  it('leaves a log of one run as Snyk wrote it', () => {
    const log = SarifLog.parse({ runs: [run('packages/ui', 'SNYK-A')] });

    expect(oneRun(log)).toBe(log);
  });
});

describe('dependencySummary', () => {
  it('counts an advisory once however many workspaces carry it', () => {
    const report = DependencyReport.parse([
      project(
        'apps/kit/package.json',
        ['SNYK-FORGE', 'critical', ['1.4.3']],
        ['SNYK-BRACES', 'high', []],
      ),
      project('clients/mobile/package.json', ['SNYK-FORGE', 'critical', ['1.4.3']]),
      project('packages/ui/package.json'),
    ]);

    const table = dependencySummary(report);

    expect(table).toContain('3 workspaces, 2 advisories.');
    expect(table).toContain('| critical | 1 | 1 |');
    expect(table).toContain('| high | 1 | 0 |');
    expect(table).toContain('| low | 0 | 0 |');
  });

  it('reads a single project, which Snyk writes as an object rather than an array', () => {
    const report = DependencyReport.parse(
      project('package.json', ['SNYK-OPEN', 'high', ['11.0.0']]),
    );

    expect(dependencySummary(report)).toContain('1 workspaces, 1 advisories.');
  });
});

describe('codeSummary', () => {
  it('reads the SARIF levels as Snyk Code severities, a missing level as a warning', () => {
    const log = SarifLog.parse({
      runs: [
        {
          tool: { driver: { name: 'SnykCode' } },
          results: [
            { ruleId: 'javascript/reDOS', level: 'error' },
            { ruleId: 'javascript/OR' },
            { ruleId: 'javascript/PT', level: 'note' },
            { ruleId: 'javascript/PT', level: 'note' },
          ],
        },
      ],
    });

    const table = codeSummary(log);

    expect(table).toContain('| high | 1 |');
    expect(table).toContain('| medium | 1 |');
    expect(table).toContain('| low | 2 |');
  });
});
