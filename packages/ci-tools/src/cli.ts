const COMMANDS = {
  lanes: async (args: string[]) => (await import('./lanes-command')).main(args),
  typecheck: async (args: string[]) => (await import('./typecheck')).main(args),
  test: async (args: string[]) => (await import('./test')).main(args),
  rust: async (args: string[]) => (await import('./rust')).main(args),
  build: async (args: string[]) => (await import('./build')).main(args),
  version: async (args: string[]) => (await import('./version')).main(args),
  canary: async (args: string[]) => (await import('./canary-command')).main(args),
  cache: async (args: string[]) => (await import('./cache')).main(args),
  tools: async (args: string[]) => (await import('./tools')).main(args),
  sonar: async (args: string[]) => (await import('./sonar')).main(args),
};

type Command = keyof typeof COMMANDS;

const isCommand = (v: string | undefined): v is Command => v !== undefined && v in COMMANDS;

const [name, ...rest] = process.argv.slice(2);

if (!isCommand(name)) {
  console.error(name ? `unknown command '${name}'` : 'usage: bun run ci <command>');
  console.error(`commands: ${Object.keys(COMMANDS).join(', ')}`);
  process.exit(1);
}

try {
  await COMMANDS[name](rest);
} catch (err) {
  console.error(`::error::${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

export {};
