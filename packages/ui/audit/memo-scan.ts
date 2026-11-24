import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { type Babel, sourceFiles } from './source-scan';

type MemoHook = 'useMemo' | 'useCallback';

/** One hand-written memo hook, and whether the React Compiler's output moves without it. */
interface MemoSite {
  file: string;
  line: number;
  hook: MemoHook;
  /** The variable it is assigned to, or null when it is returned or passed on. */
  name: string | null;
  /** True when the compiled output is the same text without this hook and
   *  without every other inert hook of the file. */
  inert: boolean;
}

interface Span {
  start: number;
  end: number;
}

interface Call extends Span {
  callee: { name?: string };
  arguments: Span[];
  loc: { start: { line: number } };
}

interface MemoCall extends Call {
  callee: { name: MemoHook };
  arguments: [Span, ...Span[]];
}

interface Declarator {
  id: { name?: string };
  init: unknown;
}

interface Found extends Span {
  hook: MemoHook;
  line: number;
  name: string | null;
  bare: string;
}

type Names = Map<unknown, string | undefined>;

const MEMO_HOOKS: ReadonlySet<string | undefined> = new Set(['useMemo', 'useCallback']);

const BARE: Record<MemoHook, (callback: string) => string> = {
  useCallback: (callback) => callback,
  useMemo: (callback) => `(${callback})()`,
};

const isMemoCall = (call: Call): call is MemoCall =>
  MEMO_HOOKS.has(call.callee.name) && call.arguments.length > 0;

function collector(calls: Call[], names: Names) {
  return () => ({
    visitor: {
      VariableDeclarator(path: { node: Declarator }) {
        names.set(path.node.init, path.node.id.name);
      },
      CallExpression(path: { node: Call }) {
        calls.push(path.node);
      },
    },
  });
}

function foundAt(call: MemoCall, name: string | null, source: string): Found {
  const [callback] = call.arguments;
  const hook = call.callee.name;
  return {
    hook,
    line: call.loc.start.line,
    name,
    start: call.start,
    end: call.end,
    bare: BARE[hook](source.slice(callback.start, callback.end)),
  };
}

function outermost(found: readonly Found[]): Found[] {
  return found.filter(
    (site) => !found.some((other) => other.start < site.start && site.end < other.end),
  );
}

async function read(at: Babel, source: string, name: string): Promise<Found[]> {
  const calls: Call[] = [];
  const names: Names = new Map();
  await at.core.transformAsync(source, at.parse(resolve(name), [collector(calls, names)]));
  return outermost(
    calls.filter(isMemoCall).map((call) => foundAt(call, names.get(call) ?? null, source)),
  );
}

function without(source: string, gone: readonly Found[]): string {
  return [...gone]
    .sort((a, b) => b.start - a.start)
    .reduce((text, site) => text.slice(0, site.start) + site.bare + text.slice(site.end), source);
}

function removable(sites: readonly Found[], same: (gone: readonly Found[]) => boolean): Found[] {
  return sites.reduce<Found[]>((gone, site) => {
    const next = gone.concat(site);
    return same(next) ? next : gone;
  }, []);
}

const larger = (first: Found[], second: Found[]) => (second.length > first.length ? second : first);

/** The memo hooks of one file. A hook is inert when the compiler writes the
 *  same output with its callback left bare. Hooks that can each go alone but
 *  not together are tried top to bottom, then bottom to top, and the pass that
 *  frees more is the one reported; top to bottom on a tie. */
async function scanText(at: Babel, source: string, name = 'source.tsx'): Promise<MemoSite[]> {
  const sites = await read(at, source, name);
  if (sites.length === 0) {
    return [];
  }
  const base = at.compile(source, name).code;
  const same = (gone: readonly Found[]) => at.compile(without(source, gone), name).code === base;
  const inert = new Set(larger(removable(sites, same), removable([...sites].reverse(), same)));
  return sites.map((site) => ({
    file: name,
    line: site.line,
    hook: site.hook,
    name: site.name,
    inert: inert.has(site),
  }));
}

/** Every memo hook under `trees`, each a directory relative to `root`. */
async function scanTrees(at: Babel, root: string, trees: readonly string[]): Promise<MemoSite[]> {
  const files = trees.flatMap((tree) => [...sourceFiles(resolve(root, tree))]);
  const found = await Promise.all(
    files.map((file) => scanText(at, readFileSync(file, 'utf8'), relative(root, file))),
  );
  return found.flat();
}

export type { MemoHook, MemoSite };
export { scanText, scanTrees };
