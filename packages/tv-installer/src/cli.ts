#!/usr/bin/env bun
import { defineCommand, runMain } from 'citty';
import { docsCommand, doctorCommand, installCommand, scanCommand, toolsCommand } from './commands';
import { exitAfter } from './exit-after';
import type { Source } from './install/artifact';
import { moduleArgs, moduleCommands, moduleOptions, modules } from './modules/registry';
import { runTui } from './tui/app';

const SOURCES: readonly Source[] = ['local', 'stable', 'canary', 'build'];

const hostArg = {
  type: 'string',
  valueHint: 'ip',
  description: 'Probe this address instead of sweeping the network, repeatable',
} as const;

const packageArg = {
  type: 'string',
  valueHint: 'path',
  description: `The ${packageKinds()} to install, instead of the newest built here`,
} as const;

const launchArg = {
  type: 'boolean',
  default: true,
  description: 'Start the app once it is installed',
  negativeDescription: 'Install without starting the app',
} as const;

const sourceArg = {
  type: 'string',
  valueHint: 'local|stable|canary|build',
  description: 'Where the package comes from, instead of the newest build in this checkout',
} as const;

const jsonArg = {
  type: 'boolean',
  default: false,
  description: 'Print what answered as JSON',
} as const;

const scan = defineCommand({
  meta: {
    name: 'scan',
    description: 'List what answered and stop, the picker without the picking.',
  },
  args: { host: hostArg, json: jsonArg },
  run: ({ args }) => exitAfter(scanCommand({ hosts: hostList(), json: args.json, launch: true })),
});

const install = defineCommand({
  meta: {
    name: 'install',
    description: 'Put KROMA on one set, or on all of them, without the picker.',
  },
  args: {
    target: {
      type: 'positional',
      required: true,
      description: "The address of a set, or 'all' for every set that answered",
    },
    host: hostArg,
    package: packageArg,
    source: sourceArg,
    launch: launchArg,
    ...moduleArgs(),
  },
  run: ({ args }) =>
    exitAfter(
      installCommand(String(args.target), {
        hosts: hostList(),
        artifact: text(args.package),
        source: asSource(text(args.source)),
        moduleOptions: moduleOptions(args),
        launch: args.launch !== false,
        json: false,
      }),
    ),
});

const tools = defineCommand({
  meta: {
    name: 'tools',
    description: 'Install the toolchain a platform needs, which the picker does on its own.',
  },
  args: {
    platform: {
      type: 'positional',
      required: true,
      description: `${withTools().join(', ')}, and more than one is allowed`,
    },
  },
  run: ({ args }) => exitAfter(toolsCommand(args._)),
});

const doctor = defineCommand({
  meta: { name: 'doctor', description: 'Show which toolchains this computer already has.' },
  run: () => exitAfter(doctorCommand()),
});

const docs = defineCommand({
  meta: {
    name: 'docs',
    description: 'Write this command tree into the package README, where nothing is typed by hand.',
  },
  args: {
    check: {
      type: 'boolean',
      default: false,
      description: 'Fail when the README is out of date instead of rewriting it',
    },
  },
  run: ({ args }) => exitAfter(docsCommand(tv, args.check)),
});

export const tv = defineCommand({
  meta: {
    name: 'tv',
    description:
      'Find the televisions on this network and put KROMA on them. With no command it opens the picker.',
  },
  args: { host: hostArg, package: packageArg, source: sourceArg, launch: launchArg, json: jsonArg },
  subCommands: { scan, install, ...moduleCommands(), tools, doctor, docs },
  run: ({ args }) => {
    const hosts = hostList();
    if (!process.stdout.isTTY) {
      return exitAfter(scanCommand({ hosts, json: args.json, launch: args.launch }));
    }
    return exitAfter(
      runTui({ hosts, artifact: args.package, source: asSource(args.source), launch: args.launch }),
    );
  },
});

function withTools(): string[] {
  return modules()
    .filter((module) => module.tools().length > 0)
    .map((module) => module.id);
}

function packageKinds(): string {
  const kinds = modules().map((module) => module.package);
  const last = kinds.at(-1) ?? '';
  return kinds.length > 1 ? `${kinds.slice(0, -1).join(', ')} or ${last}` : last;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function asSource(value: string | undefined): Source | undefined {
  if (value === undefined) return undefined;
  if (!SOURCES.includes(value as Source)) throw new Error(`--source takes ${SOURCES.join(', ')}`);
  return value as Source;
}

// citty keeps only the last --host, so every repeat is read from argv instead.
function hostList(): string[] | undefined {
  const argv = process.argv.slice(2);
  const hosts = argv.flatMap((arg, index) => {
    if (arg.startsWith('--host=')) return [arg.slice('--host='.length)];
    if (arg !== '--host') return [];
    const value = argv[index + 1];
    return value === undefined || value.startsWith('-') ? [] : [value];
  });
  return hosts.length > 0 ? hosts : undefined;
}

if (import.meta.main) await runMain(tv);
