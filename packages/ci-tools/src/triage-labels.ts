import { parseCommit } from './commits';
import { matchesAny } from './glob';

/** The three axes docs/TICKETS.md asks every ticket to carry, as the repository defines them. */
export interface Axes {
  type: readonly string[];
  priority: readonly string[];
  area: readonly string[];
}

/** What triage suggests for a ticket, before anything it already carries is taken into account. */
export interface Proposal {
  type?: string;
  priority?: string;
  areas: readonly string[];
}

/** Where each area lives in the tree. A pull request is in every area one of its files matches. */
export const AREA_PATHS: ReadonlyArray<readonly [area: string, globs: readonly string[]]> = [
  ['area/server', ['server/**']],
  ['area/modules', ['modules/**']],
  ['area/sdk', ['packages/{module-sdk,cli,bundler,registry}/**', 'packages/ci-tools/src/sdk/**']],
  ['area/web', ['clients/web/**']],
  [
    'area/tv',
    [
      'clients/{tizen,webos,tv-web,tv-native,tv-build}/**',
      'packages/{tv,spatial-nav,tv-installer,tv-probe}/**',
    ],
  ],
  ['area/mobile', ['clients/{mobile,expo-build}/**']],
  ['area/desktop', ['clients/desktop/**']],
  ['area/synology', ['clients/synology/**', 'packages/synology-repo/**']],
  ['area/ui-kit', ['packages/{ui,workbench}/**', 'apps/kit/**']],
  ['area/ci', ['.github/**', 'packages/{ci-tools,sonar-tools}/**']],
  ['area/docs', ['docs/**', '*.md']],
];

const SURFACES: ReadonlyArray<readonly [choice: string, area: string]> = [
  ['Server (Rust)', 'area/server'],
  ['Module (tv.kroma.*)', 'area/modules'],
  ['SDK / tooling', 'area/sdk'],
  ['Web client', 'area/web'],
  ['TV ', 'area/tv'],
  ['Mobile', 'area/mobile'],
  ['Desktop', 'area/desktop'],
  ['Synology package', 'area/synology'],
  ['UI kit', 'area/ui-kit'],
  ['CI / release', 'area/ci'],
  ['Docs', 'area/docs'],
];

const COMMIT_TYPES: Readonly<Record<string, string>> = {
  feat: 'type/feature',
  fix: 'type/bug',
  refactor: 'type/refactor',
  perf: 'type/perf',
  docs: 'type/docs',
  chore: 'type/chore',
  ci: 'type/chore',
  build: 'type/chore',
  test: 'type/chore',
};

const SURFACE_HEADING = /^### Surfaces?(?: affected)?\s*$/m;

const unique = (names: readonly string[]) => [...new Set(names)];

/** The areas a pull request's changed files reach, in the order `AREA_PATHS` lists them. */
export function areasOfPaths(paths: readonly string[]): string[] {
  return AREA_PATHS.filter(([, globs]) => paths.some((path) => matchesAny(path, globs))).map(
    ([area]) => area,
  );
}

/** The areas an issue form's Surface answer names, or none when the body is not a form. */
export function areasOfForm(body: string): string[] {
  const heading = SURFACE_HEADING.exec(body);
  if (!heading) return [];
  const rest = body.slice(heading.index + heading[0].length);
  const answer = rest.split(/^### /m)[0] ?? '';
  return unique(SURFACES.filter(([choice]) => answer.includes(choice)).map(([, area]) => area));
}

/** The type a conventional-commit title names, or undefined for any other title. */
export function typeOfTitle(title: string): string | undefined {
  const commit = parseCommit('', title);
  return commit ? COMMIT_TYPES[commit.type] : undefined;
}

/**
 * The labels to add: a proposal's label on each axis the ticket carries none
 * of, and only names the repository defines. Never one the ticket already has,
 * and never a replacement for one a person set.
 */
export function additions(current: readonly string[], proposal: Proposal, axes: Axes): string[] {
  const empty = (axis: keyof Axes) => !current.some((label) => label.startsWith(`${axis}/`));
  const known = (axis: keyof Axes) => (name: string | undefined) =>
    name !== undefined && axes[axis].includes(name) ? [name] : [];
  return unique([
    ...(empty('type') ? known('type')(proposal.type) : []),
    ...(empty('priority') ? known('priority')(proposal.priority) : []),
    ...(empty('area') ? proposal.areas.flatMap(known('area')) : []),
  ]);
}

/** Whether every axis already carries a label, so there is nothing left to ask. */
export function isTriaged(current: readonly string[]): boolean {
  return (['type', 'priority', 'area'] as const).every((axis) =>
    current.some((label) => label.startsWith(`${axis}/`)),
  );
}
