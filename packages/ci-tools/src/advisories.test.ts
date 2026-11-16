import { describe, expect, it } from 'vitest';
import { auditSarif, auditSummary, BunAudit, lockLine } from './advisories';

const advisory = (ghsa: string, severity: string, title = 'a flaw') => ({
  id: 1,
  url: `https://github.com/advisories/${ghsa}`,
  title,
  severity,
  vulnerable_versions: '<=1.4.0',
  cwe: ['CWE-295'],
});

const lock = [
  '{',
  '  "packages": {',
  '    "fast-glob": ["fast-glob@3.3.3", "", {}, "sha512-x"],',
  '    "node-forge": ["node-forge@1.4.0", "", {}, "sha512-y"],',
  '    "expo/glob": ["glob@11.1.0", "", {}, "sha512-z"],',
].join('\n');

const at = (startLine: number) => [{ physicalLocation: { region: { startLine } } }];

describe('lockLine', () => {
  it('finds the line that resolves the package, nested under another or not', () => {
    expect(lockLine(lock, 'node-forge')).toBe(4);
    expect(lockLine(lock, 'glob')).toBe(5);
  });

  it('falls back to the first line for a package the lockfile does not name', () => {
    expect(lockLine(lock, 'hono')).toBe(1);
  });
});

describe('auditSarif', () => {
  it('writes a rule per advisory and a result per package it touches, on its bun.lock line', () => {
    const audit = BunAudit.parse({
      'node-forge': [advisory('GHSA-aaaa', 'critical'), advisory('GHSA-bbbb', 'low')],
      glob: [advisory('GHSA-aaaa', 'critical')],
    });

    const { runs } = auditSarif(audit, lock);

    expect(runs).toMatchObject([
      {
        tool: {
          driver: {
            rules: [
              { id: 'GHSA-aaaa', properties: { 'security-severity': '9.0' } },
              { id: 'GHSA-bbbb', properties: { 'security-severity': '0.1' } },
            ],
          },
        },
        results: [
          {
            ruleId: 'GHSA-aaaa',
            level: 'error',
            message: { text: 'node-forge <=1.4.0: a flaw' },
            locations: at(4),
          },
          { ruleId: 'GHSA-bbbb', level: 'note', locations: at(4) },
          { ruleId: 'GHSA-aaaa', level: 'error', locations: at(5) },
        ],
      },
    ]);
  });
});

describe('auditSummary', () => {
  it('counts the advisories by severity and the packages that carry them', () => {
    const audit = BunAudit.parse({
      'node-forge': [advisory('GHSA-aaaa', 'high'), advisory('GHSA-bbbb', 'moderate')],
      hono: [advisory('GHSA-cccc', 'moderate')],
    });

    const table = auditSummary(audit);

    expect(table).toContain('3 advisories in 2 packages (bun audit).');
    expect(table).toContain('| high | 1 |');
    expect(table).toContain('| moderate | 2 |');
    expect(table).toContain('| critical | 0 |');
  });

  it('reads an audit that found nothing', () => {
    expect(auditSummary(BunAudit.parse({}))).toContain('0 advisories in 0 packages');
  });
});
