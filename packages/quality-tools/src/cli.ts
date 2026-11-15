import process from 'node:process';

const COMMANDS = {
  setup: async () => (await import('./setup-command')).main(),
  crap: async (args: string[]) => (await import('./crap-command')).main(args),
  dry: async (args: string[]) => (await import('./dry-command')).main(args),
  mutate: async (args: string[]) => (await import('./mutate-command')).main(args),
  report: async (args: string[]) => (await import('./report-command')).main(args),
};

type Command = keyof typeof COMMANDS;

const isCommand = (v: string | undefined): v is Command => v !== undefined && v in COMMANDS;

const [name, ...rest] = process.argv.slice(2);

if (!isCommand(name)) {
  console.error(name ? `unknown command '${name}'` : 'usage: bun run quality:<command>');
  console.error(`commands: ${Object.keys(COMMANDS).join(', ')}`);
  process.exit(1);
}

try {
  await COMMANDS[name](rest);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
