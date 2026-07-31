// Prop documentation, read from the components at BUILD time.
//
// The workbench's Props tab shows every prop a component takes, its type and
// the JSDoc line explaining what it is for, read here against a real type
// checker rather than a regex over source text - which cannot follow
// `extends`, so a <Button> would document ten props and take eighteen.
//
// The checker is TypeScript 7's own, which is the version this repo already
// builds with - no second toolchain, and no react-docgen-typescript, whose
// classic-API requirement would have meant pinning TypeScript 5 beside it.
//
// The ASYNC half of that API, deliberately: the sync one reaches for
// `stdout._handle.fd` to run its RPC channel over a raw file descriptor, which
// is a Node internal Bun does not implement - and every build in this repo is
// run by Bun. A Vite plugin's `load` may return a promise, so nothing is lost.
//
// The one subtlety worth keeping: a prop's type is read from the AST as WRITTEN,
// not from `checker.typeToString`. The checker resolves an alias to its
// definition, which turns the honest `icon?: IconName` into a 6215-member union
// of every Tabler glyph, truncated by the compiler and useless to a reader. The
// declaration's own source text is what the author wrote and what a reader wants
// to see; the checker is used only to enumerate WHICH props exist, which is the
// part it is uniquely good at.

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { API } from 'typescript/unstable/async';

/** One documented prop, as the workbench's panel shows it. Mirrors
 * `PropDoc` in @kroma/workbench; kept structural rather than imported so this
 * build-time module has no runtime dependency on the package. */
export interface PropDoc {
  name: string;
  type: string;
  optional: boolean;
  docs?: string;
}

/** Component display name -> its props. The workbench looks a story's props up
 * by the story's own name, which is the component's name by convention. */
export type PropDocs = Record<string, PropDoc[]>;

// Props every React component has and nobody needs told about.
const NOISE = new Set(['key']);

// The JSDoc block immediately above a member, as one paragraph. `@tag` lines are dropped: they
// document the author's intent, not the prop.
function docsFrom(memberText: string): string {
  const block = /^\s*\/\*\*((?:(?!\*\/)[\s\S])*)\*\//.exec(memberText);
  if (!block?.[1]) return '';
  return block[1]
    .split('\n')
    .map((line) => line.replace(/^\s*\*?/, '').trim())
    .filter((line) => line && !line.startsWith('@'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A declaring file's text, memoised by the caller. An inherited prop is declared in the file
// its own interface lives in, so this is keyed by the DECLARATION's path rather than the
// component's.
type TextOf = (path: string) => Promise<string>;

type Snapshot = Awaited<ReturnType<API['updateSnapshot']>>;
type Project = NonNullable<ReturnType<Snapshot['getProject']>>;
type Checker = Project['checker'];
type PropSymbol = Awaited<ReturnType<Checker['getPropertiesOfType']>>[number];

// One property, as the panel shows it - or null when it is noise, or has no declaration to read
// a written type and a doc comment out of.
async function propDocOf(symbol: PropSymbol, textOf: TextOf): Promise<PropDoc | null> {
  if (NOISE.has(symbol.name)) return null;
  const handle = symbol.declarations?.[0];
  const node = (await handle?.resolve()) as
    | { pos: number; end: number; type?: { pos: number; end: number } }
    | undefined;
  if (!handle || !node) return null;
  const source = await textOf(handle.path);
  // `pos` starts at the end of the previous token, so this span carries the
  // member's leading trivia - which is where its JSDoc is.
  const member = source.slice(node.pos, node.end);
  const written = node.type ? source.slice(node.type.pos, node.type.end).trim() : 'unknown';
  const docs = docsFrom(member);
  return {
    name: symbol.name,
    type: written,
    // Read off the declaration text: TS 7's node proxies do not surface
    // `questionToken`, and `name?:` is unambiguous in a member.
    optional: new RegExp(String.raw`\b${symbol.name}\s*\?\s*:`).test(member),
    ...(docs ? { docs } : null),
  };
}

// `interface FooProps { ... }` -> `Foo` and its documented props. Null for any other statement,
// and for a `*Props` that turns out to document nothing.
async function componentPropsOf(
  statement: unknown,
  checker: Checker,
  textOf: TextOf,
): Promise<{ component: string; props: PropDoc[] } | null> {
  const declared = (statement as { name?: { text?: string } }).name?.text;
  if (!declared?.endsWith('Props')) return null;
  const component = declared.slice(0, -'Props'.length);
  if (!component) return null;
  const type = await checker.getTypeAtLocation((statement as { name?: unknown }).name as never);
  if (!type) return null;
  // Every prop in flight at once: the checker is an RPC channel, and awaiting
  // one round-trip per prop is what made this plugin show up in build timings.
  const symbols = await checker.getPropertiesOfType(type);
  const docs = await Promise.all(symbols.map((symbol) => propDocOf(symbol, textOf)));
  const props = docs.filter((doc): doc is PropDoc => doc !== null);
  return props.length ? { component, props } : null;
}

/**
 * Read the props of every `interface <Name>Props` in the given project.
 *
 * `tsconfig` is the project whose program the components live in;
 * `include` decides which of its files are scanned (the design system's
 * components, not its tests or its stories).
 */
export async function readPropDocs(
  tsconfig: string,
  include: (fileName: string) => boolean,
): Promise<PropDocs> {
  const api = new API({ cwd: process.cwd() });
  try {
    const snapshot = await api.updateSnapshot({ openProjects: [tsconfig] });
    const project = snapshot.getProject(tsconfig) ?? snapshot.getProjects()[0];
    if (!project) throw new Error(`props-docs: could not open ${tsconfig}`);
    const { program, checker } = project;

    // Each declaring file's text, fetched once. An inherited prop is declared in
    // the file its interface lives in, not in the component's, so this is keyed
    // by the DECLARATION's path rather than by the component's. The map holds
    // PROMISES so concurrent lookups of one path share a single fetch.
    const texts = new Map<string, Promise<string>>();
    const textOf: TextOf = (path) => {
      let hit = texts.get(path);
      if (!hit) {
        hit = program.getSourceFile(path).then((file) => file?.text ?? '');
        texts.set(path, hit);
      }
      return hit;
    };

    // Everything in flight at once: the checker is an RPC channel, so the cost
    // model is round-trips, not work.
    const names = (await program.getSourceFileNames()).filter(include);
    const files = await Promise.all(names.map((name) => program.getSourceFile(name)));
    const found = await Promise.all(
      files.flatMap((file) =>
        (file?.statements ?? []).map((statement) => componentPropsOf(statement, checker, textOf)),
      ),
    );

    const out: PropDocs = {};
    for (const entry of found) {
      if (entry) out[entry.component] = entry.props;
    }
    return out;
  } finally {
    api.close();
  }
}

// Bumped when the extraction logic changes shape, so a stale cache from an
// older plugin cannot serve.
const CACHE_VERSION = 1;

async function statLine(path: string): Promise<string> {
  const s = await stat(path).catch(() => null);
  return s ? `${path}:${s.mtimeMs}:${s.size}` : `${path}:absent`;
}

// The nearest lockfile above the project: a dependency bump can change an
// inherited prop's type (ViewProps and friends), and this is the cheap signal
// for it.
async function lockfileOf(root: string): Promise<string> {
  for (let dir = root; ; ) {
    const candidate = join(dir, 'bun.lock');
    const s = await stat(candidate).catch(() => null);
    if (s) return candidate;
    const up = dirname(dir);
    if (up === dir) return candidate;
    dir = up;
  }
}

/** A hash of everything the docs are derived from: the scanned sources' paths,
 *  sizes and mtimes, the tsconfig, and the lockfile. Cheap enough to run per
 *  build - a directory walk, no file reads. Walks `src` only: the package root
 *  holds a node_modules whose workspace symlinks recurse into each other. */
async function fingerprint(tsconfig: string, include: (fileName: string) => boolean) {
  const root = dirname(tsconfig);
  const src = join(root, 'src');
  const entries = await readdir(src, { recursive: true });
  const sources = entries
    .map((entry) => join(src, entry))
    .filter((path) => /\.tsx?$/.test(path) && include(path))
    .sort((a, b) => (a < b ? -1 : 1));
  const lines = await Promise.all([tsconfig, await lockfileOf(root), ...sources].map(statLine));
  return createHash('sha256')
    .update(`${CACHE_VERSION}\n${lines.join('\n')}`)
    .digest('hex');
}

const cacheFile = (hash: string): string =>
  join(process.cwd(), 'node_modules', '.cache', 'kroma', `props-docs-${hash}.json`);

async function readCache(hash: string): Promise<string | null> {
  return readFile(cacheFile(hash), 'utf8').catch(() => null);
}

async function writeCache(hash: string, json: string): Promise<void> {
  const path = cacheFile(hash);
  await mkdir(dirname(path), { recursive: true }).catch(() => {});
  await writeFile(path, json).catch(() => {});
}

// The module a host imports to get the docs. Virtual: nothing is written to disk, so there is
// no generated artifact to keep in step or to gitignore.
const VIRTUAL = 'virtual:kroma-props';
// Rollup's convention for "this id belongs to a plugin, do not touch it".
const RESOLVED = `\0${VIRTUAL}`;

export interface PropDocsOptions {
  // The project whose program the components live in.
  tsconfig: string;
  // Which of its files to scan. Defaults to everything but tests and stories.
  include?: (fileName: string) => boolean;
  // Files whose changes should refresh the docs during `vite dev`. Defaults to anything the
  // `include` filter accepts.
  watch?: (fileName: string) => boolean;
}

const DEFAULT_INCLUDE = (fileName: string): boolean =>
  fileName.includes('/packages/ui/src/') && !/\.(stories|demo|test)\.tsx$/.test(fileName);

/**
 * Serves `virtual:kroma-props` — every component's props, read by the checker.
 *
 * A plugin rather than a codegen script on purpose. The objection to generating
 * this has always been "another build artifact to keep in step"; a virtual
 * module has no artifact. It is computed from the components themselves on every
 * build, and invalidated when one of them changes, so it cannot drift.
 */
export function propDocs(options: PropDocsOptions): import('vite').Plugin {
  const include = options.include ?? DEFAULT_INCLUDE;
  const watch = options.watch ?? include;
  return {
    name: 'kroma:props-docs',
    resolveId: (id) => (id === VIRTUAL ? RESOLVED : null),
    // Cached on disk against a fingerprint of the scanned sources: opening the
    // checker costs seconds, and most builds change no component. A source edit
    // moves the fingerprint and the build recomputes.
    async load(id) {
      if (id !== RESOLVED) return null;
      // A cache failure must never fail the build: no hash simply means
      // recompute, exactly as if the cache did not exist.
      const hash = await fingerprint(options.tsconfig, include).catch(() => null);
      const cached = hash ? await readCache(hash) : null;
      if (cached) return `export const PROPS = ${cached};`;
      const docs = await readPropDocs(options.tsconfig, include);
      const json = JSON.stringify(docs);
      if (hash) await writeCache(hash, json);
      return `export const PROPS = ${json};`;
    },
    // Editing a prop's type or its doc comment refreshes the panel, rather than
    // needing the dev server restarted - which is the difference between the
    // Props tab being trustworthy and being something you stop believing.
    handleHotUpdate({ file, server }) {
      if (!watch(file)) return;
      const mod = server.moduleGraph.getModuleById(RESOLVED);
      if (mod) server.moduleGraph.invalidateModule(mod);
    },
  };
}
