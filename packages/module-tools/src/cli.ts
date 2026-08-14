// Every module chore behind one entry point: `bun run modules <command>`.
//
//   gen       regenerate the crates and the frontend registry from *.module.md
//   new       scaffold a new module manifest
//   validate  check every manifest against the schema
//   pack      build .kmod bundles into dist/modules
//   plan      print the cross-compile script CI runs instead of `pack`
//   cargo     run one cargo subcommand across every module workspace
//   registry  turn packed bundles into a publishable catalog (one base URL)
//   release   decide which modules to publish on their own tags, and merge the
//             catalog against what is already live
//   watch     rebuild + install one module's sidecar on every save (dev loop)

const COMMANDS = {
  gen: () => import('./gen'),
  new: () => import('./new'),
  validate: () => import('./validate'),
  // `pack` alone exports a function: the other commands import it for its
  // helpers, so its CLI body must not run on import.
  pack: async (args: string[]) => (await import('./pack')).main(args),
  plan: () => import('./plan'),
  cargo: () => import('./cargo'),
  registry: () => import('./registry'),
  release: async () => (await import('./release')).main(),
  watch: async (args: string[]) => (await import('./watch')).main(args),
};

type Command = keyof typeof COMMANDS;

const isCommand = (v: string | undefined): v is Command => v !== undefined && v in COMMANDS;

const [name, ...rest] = process.argv.slice(2);

if (!isCommand(name)) {
  const known = Object.keys(COMMANDS).join(', ');
  console.error(name ? `unknown command '${name}'` : 'usage: bun run modules <command>');
  console.error(`commands: ${known}`);
  process.exit(1);
}

// The commands read their own flags off process.argv, so drop the command name
// before handing over: each one sees the argv it saw as a standalone script.
process.argv = [process.argv[0] as string, process.argv[1] as string, ...rest];

await COMMANDS[name](rest);

export {};
