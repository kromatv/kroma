import process from 'node:process';

type Run = (args: string[]) => unknown;

const LOADERS: Record<string, () => Promise<{ main: Run }>> = {
  setup: () => import('./setup-command'),
  crap: () => import('./crap-command'),
  dry: () => import('./dry-command'),
  mutate: () => import('./mutate-command'),
  report: () => import('./report-command'),
  gates: () => import('./gates-command'),
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const [name = '', ...rest] = process.argv.slice(2);
const load = LOADERS[name];
if (!load) {
  fail(`usage: bun run quality:<command>, one of ${Object.keys(LOADERS).join(', ')}`);
}

try {
  const { main } = await load();
  await main(rest);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
