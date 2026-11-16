import { describe, expect, it } from 'vitest';
import { codeSummary, SnykCodeSarif } from './snyk-code';

describe('codeSummary', () => {
  it('reads the SARIF levels as Snyk Code severities, a missing level as a warning', () => {
    const log = SnykCodeSarif.parse({
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
