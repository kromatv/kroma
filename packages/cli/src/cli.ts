#!/usr/bin/env bun
import { defineCommand, runMain } from 'citty';
import { exitAfter } from './exit-after';

const dirsArg = {
  type: 'positional',
  required: false,
  description: 'Module directories; default: this module, or every one under modules/',
} as const;

const serverArgs = {
  server: { type: 'string', valueHint: 'url', description: 'The KROMA server (KROMA_SERVER)' },
  token: { type: 'string', valueHint: 'token', description: 'A session token (KROMA_TOKEN)' },
} as const;

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v !== '' ? v : undefined;
const list = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  return typeof v === 'string' && v !== '' ? [v] : [];
};

const create = defineCommand({
  meta: {
    name: 'create',
    description: 'Scaffold a module: a few questions, then a project ready for `kroma dev`.',
  },
  args: {
    dir: {
      type: 'positional',
      required: false,
      description: 'Where to put it (defaults to the module id)',
    },
    id: { type: 'string', valueHint: 'tv.acme.notes', description: 'The module id' },
    name: { type: 'string', description: 'Display name' },
    description: { type: 'string', description: 'One line about the module' },
    kind: {
      type: 'string',
      valueHint: 'full|server|ui',
      description: 'A page and a sidecar, a sidecar, or a page',
    },
    storage: { type: 'boolean', description: 'The sidecar keeps its own database' },
    'in-repo': {
      type: 'boolean',
      description: 'Path deps into this checkout (the default inside it)',
    },
    install: {
      type: 'boolean',
      default: true,
      description: 'Run bun install afterwards',
      negativeDescription: 'Skip bun install',
    },
    yes: { type: 'boolean', default: false, description: 'Take every default, ask nothing' },
  },
  run: ({ args }) =>
    exitAfter(
      import('./commands/create').then((m) =>
        m.createCommand({
          dir: text(args.dir),
          id: text(args.id),
          name: text(args.name),
          description: text(args.description),
          kind: text(args.kind),
          storage: typeof args.storage === 'boolean' ? args.storage : undefined,
          inRepo: typeof args['in-repo'] === 'boolean' ? args['in-repo'] : undefined,
          install: args.install !== false,
          yes: args.yes === true,
        }),
      ),
    ),
});

const dev = defineCommand({
  meta: {
    name: 'dev',
    description: 'Build the module, install it on a server, and again on every save.',
  },
  args: {
    dir: {
      type: 'positional',
      required: false,
      description: 'The module directory (default: here)',
    },
    target: {
      type: 'string',
      valueHint: 'triple',
      description: 'Cross-compile the sidecar for the server',
    },
    ...serverArgs,
  },
  run: ({ args }) =>
    exitAfter(
      import('./commands/dev').then((m) =>
        m.devCommand({
          dir: text(args.dir),
          target: text(args.target),
          server: text(args.server),
          token: text(args.token),
        }),
      ),
    ),
});

const build = defineCommand({
  meta: {
    name: 'build',
    description: 'Pack the installable .kmod: the sidecar, the frontend, the manifest.',
  },
  args: {
    dirs: dirsArg,
    out: {
      type: 'string',
      valueHint: 'dir',
      description: 'Output directory (default: dist/modules)',
    },
    target: {
      type: 'string',
      valueHint: 'triple',
      description: 'Cross-compile for this Rust target (KMOD_TARGET)',
    },
    debug: { type: 'boolean', default: false, description: 'A dev-profile sidecar' },
    'skip-build': {
      type: 'boolean',
      default: false,
      description: 'Pack a binary built out of band (KMOD_SKIP_BUILD)',
    },
  },
  run: ({ args }) =>
    exitAfter(
      import('./commands/build').then((m) =>
        m.buildCommand({
          dirs: list(args._),
          out: text(args.out),
          target: text(args.target),
          profile: args.debug ? 'dev' : 'release-kmod',
          skipBuild: args['skip-build'] || undefined,
        }),
      ),
    ),
});

const check = defineCommand({
  meta: {
    name: 'check',
    description: 'Validate the manifest, type-check the frontend, clippy the sidecar.',
  },
  args: {
    dirs: dirsArg,
    rust: {
      type: 'boolean',
      default: true,
      description: 'Run clippy',
      negativeDescription: 'Skip clippy',
    },
    ts: { type: 'boolean', default: true, description: 'Run tsc', negativeDescription: 'Skip tsc' },
  },
  run: ({ args }) =>
    exitAfter(
      import('./commands/check').then((m) =>
        m.checkCommand({ dirs: list(args._), rust: args.rust !== false, ts: args.ts !== false }),
      ),
    ),
});

const install = defineCommand({
  meta: { name: 'install', description: 'Upload a packed .kmod to a running server.' },
  args: {
    id: {
      type: 'positional',
      required: false,
      description: 'The module id (default: this module)',
    },
    file: { type: 'string', valueHint: 'path', description: 'A .kmod to upload instead' },
    from: {
      type: 'string',
      valueHint: 'dir',
      description: 'Where the bundles are (default: dist/modules)',
    },
    ...serverArgs,
  },
  run: ({ args }) =>
    exitAfter(
      import('./commands/install').then((m) =>
        m.installCommand({
          id: text(args.id),
          file: text(args.file),
          from: text(args.from),
          server: text(args.server),
          token: text(args.token),
        }),
      ),
    ),
});

const login = defineCommand({
  meta: { name: 'login', description: 'Sign in to a server once; dev and install use the token.' },
  args: {
    server: {
      type: 'positional',
      required: false,
      description: 'The server URL (default: http://localhost:4040)',
    },
    email: { type: 'string', description: 'Email or username (KROMA_EMAIL)' },
    password: { type: 'string', description: 'Password (KROMA_PASSWORD)' },
  },
  run: ({ args }) =>
    exitAfter(
      import('./commands/login').then((m) =>
        m.loginCommand({
          server: text(args.server),
          email: text(args.email),
          password: text(args.password),
        }),
      ),
    ),
});

const plan = defineCommand({
  meta: {
    name: 'plan',
    description: 'Print the cargo build lines CI runs in its cross-compile container.',
  },
  args: {
    dirs: dirsArg,
    target: { type: 'string', valueHint: 'triple', description: 'The Rust target (KMOD_TARGET)' },
  },
  run: ({ args }) =>
    exitAfter(
      import('./commands/plan').then((m) => m.planCommand(list(args._), text(args.target))),
    ),
});

const cargo = defineCommand({
  meta: { name: 'cargo', description: 'Run one cargo subcommand in every module workspace.' },
  args: {
    args: {
      type: 'positional',
      required: true,
      description: 'The cargo subcommand and its arguments',
    },
  },
  run: ({ rawArgs }) =>
    exitAfter(
      import('./commands/cargo').then((m) => m.cargoCommand(rawArgs.filter((a) => a !== '--'))),
    ),
});

const registry = defineCommand({
  meta: {
    name: 'registry',
    description: 'Write the packed bundles as a static registry for any host.',
  },
  args: {
    from: {
      type: 'string',
      valueHint: 'dir',
      description: 'Where the bundles are (default: dist/modules)',
    },
    out: {
      type: 'string',
      valueHint: 'dir',
      description: 'Output directory (default: dist/registry)',
    },
    base: {
      type: 'string',
      valueHint: 'url',
      description: 'The URL the registry will be served at',
    },
  },
  run: ({ args }) =>
    exitAfter(
      import('./commands/registry').then((m) =>
        m.registryCommand({ from: text(args.from), out: text(args.out), base: text(args.base) }),
      ),
    ),
});

const serve = defineCommand({
  meta: { name: 'serve', description: 'Serve the packed bundles as a live registry to browse.' },
  args: {
    from: {
      type: 'string',
      valueHint: 'dir',
      description: 'Where the bundles are (default: dist/modules)',
    },
    port: { type: 'string', valueHint: 'port', description: 'Port (default: 4173)' },
  },
  run: ({ args }) =>
    exitAfter(
      import('./commands/serve').then((m) =>
        m.serveCommand({ from: text(args.from), port: args.port ? Number(args.port) : undefined }),
      ),
    ),
});

const release = defineCommand({
  meta: { name: 'release', description: 'Decide which packed modules publish on their own tags.' },
  args: {
    repo: {
      type: 'string',
      valueHint: 'owner/name',
      description: 'The GitHub repository (GITHUB_REPOSITORY)',
    },
    published: {
      type: 'string',
      valueHint: 'url|file',
      description: 'The live catalog to compare against',
    },
    from: {
      type: 'string',
      valueHint: 'dir',
      description: 'Where the bundles are (default: dist/modules)',
    },
    out: {
      type: 'string',
      valueHint: 'dir',
      description: 'Output directory (default: dist/registry)',
    },
    'dry-run': { type: 'boolean', default: false, description: 'Decide and print, write nothing' },
    strict: {
      type: 'boolean',
      default: false,
      description: 'An unbumped changed module fails the run',
    },
  },
  run: ({ args }) =>
    exitAfter(
      import('./commands/release').then((m) =>
        m.releaseCommand({
          repo: text(args.repo),
          published: text(args.published),
          from: text(args.from),
          out: text(args.out),
          dryRun: args['dry-run'] === true,
          strict: args.strict === true,
        }),
      ),
    ),
});

const main = defineCommand({
  meta: { name: 'kroma', description: 'Build KROMA modules.' },
  subCommands: { create, dev, build, check, install, login, plan, cargo, registry, serve, release },
});

runMain(main);
