import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCrap } from './crap-command';
import { runDry } from './dry-command';
import { layout } from './layout';
import { settle } from './outcome';
import { root } from './root';
import { parseScope } from './scope';
import { renderSummary } from './summary';

export async function main(argv: string[]): Promise<void> {
  const scope = parseScope(argv);
  const crap = await settle(runCrap(scope));
  const dry = await settle(runDry(scope));
  const at = layout(root);
  mkdirSync(at.metrics, { recursive: true });
  const summary = renderSummary(crap, dry);
  writeFileSync(join(at.metrics, 'summary.md'), summary);
  console.log(summary);
  if (!crap.ok || !dry.ok) {
    throw new Error('part of the report was not produced, the summary says which');
  }
}
