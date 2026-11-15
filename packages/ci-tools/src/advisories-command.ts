import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { $ } from 'bun';
import { summary } from './actions';
import { auditSarif, auditSummary, BunAudit } from './advisories';
import { root } from './root';

const REPORT = join(root, '.sarif/bun-audit.sarif');

function parseAudit(exitCode: number, stdout: string): BunAudit {
  if (exitCode === 0 && stdout.trim() === '') {
    return {};
  }
  return BunAudit.parse(JSON.parse(stdout));
}

export async function main(): Promise<void> {
  const { exitCode, stdout, stderr } = await $`bun audit --json`.cwd(root).quiet().nothrow();
  if (exitCode > 1) {
    throw new Error(`bun audit ended ${exitCode}: ${stderr.toString().trim()}`);
  }
  const audit = parseAudit(exitCode, stdout.toString());
  const lock = readFileSync(join(root, 'bun.lock'), 'utf8');
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, JSON.stringify(auditSarif(audit, lock)));
  summary(auditSummary(audit));
}
