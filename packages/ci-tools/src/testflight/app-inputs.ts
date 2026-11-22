import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { matchesAny } from '../glob';
import { root } from '../root';

/** A TestFlight platform, as App Store Connect spells it. */
export type Platform = 'IOS' | 'TV_OS';

/** An app CI sends to TestFlight. */
export interface TestFlightApp {
  workspace: string;
  workflow: string;
  job: string;
  platform: Platform;
}

/** The two Apple apps, by the name `bun run ci testflight` takes. */
export const APPS = {
  mobile: {
    workspace: '@kromatv/mobile',
    workflow: '_release-mobile.yml',
    job: 'Mobile .ipa (TestFlight)',
    platform: 'IOS',
  },
  appletv: {
    workspace: '@kromatv/tv-native',
    workflow: '_release-appletv.yml',
    job: 'Apple TV .ipa (TestFlight)',
    platform: 'TV_OS',
  },
} as const satisfies Record<string, TestFlightApp>;

/** A workspace package: where it lives and the workspace packages it depends on. */
export interface Workspace {
  dir: string;
  deps: string[];
}

const Manifest = z.object({
  name: z.string().nonempty(),
  dependencies: z.record(z.string(), z.string()).default({}),
  devDependencies: z.record(z.string(), z.string()).default({}),
});

const Root = z.object({ workspaces: z.array(z.string().nonempty()) });

const SHARED = [
  'bun.lock',
  'package.json',
  'patches/**',
  '.bun-version',
  'tsconfig.base.json',
  '.github/scripts/{ios-*,stamp-mobile-version.ts,pin-target-signing.py}',
];

const NEVER = ['**/*.md', 'docs/**', '**/*.test.{ts,tsx}'];

function readManifest(dir: string): [string, Workspace] {
  const manifest = Manifest.parse(
    JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8')),
  );
  const all = { ...manifest.dependencies, ...manifest.devDependencies };
  const deps = Object.entries(all)
    .filter(([, spec]) => spec.startsWith('workspace:'))
    .map(([name]) => name);
  return [manifest.name, { dir, deps }];
}

/** Every workspace package of the repository, by package name. */
export function readWorkspaces(): Map<string, Workspace> {
  const { workspaces } = Root.parse(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')));
  const found = new Map<string, Workspace>();
  for (const pattern of workspaces) {
    const parent = pattern.replace(/\/\*$/, '');
    for (const entry of readdirSync(join(root, parent), { withFileTypes: true })) {
      const dir = `${parent}/${entry.name}`;
      if (entry.isDirectory() && existsSync(join(root, dir, 'package.json'))) {
        const [name, workspace] = readManifest(dir);
        found.set(name, workspace);
      }
    }
  }
  return found;
}

/** The directories of `start` and of every workspace package it reaches. */
export function closure(start: string, workspaces: ReadonlyMap<string, Workspace>): string[] {
  const dirs = new Map<string, string>();
  const queue = [start];
  while (queue.length > 0) {
    const name = queue.pop() ?? '';
    const workspace = workspaces.get(name);
    if (workspace && !dirs.has(name)) {
      dirs.set(name, workspace.dir);
      queue.push(...workspace.deps);
    }
  }
  return [...dirs.values()].sort((a, b) => a.localeCompare(b));
}

/** The path globs a change must touch to change what `app` ships. */
export function appInputs(
  app: TestFlightApp,
  workspaces: ReadonlyMap<string, Workspace>,
): string[] {
  const dirs = closure(app.workspace, workspaces);
  if (dirs.length === 0) {
    throw new Error(`no workspace package is named ${app.workspace}`);
  }
  return [...dirs.map((dir) => `${dir}/**`), ...SHARED, `.github/workflows/${app.workflow}`];
}

/** The changed files that reach the app, `'all'` counting as every one. */
export function reaching(
  files: readonly string[] | 'all',
  inputs: readonly string[],
): string[] | 'all' {
  if (files === 'all') {
    return 'all';
  }
  return files.filter((file) => matchesAny(file, inputs) && !matchesAny(file, NEVER));
}
