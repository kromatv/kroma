// What a component allocates inside a list render: every kit component through
// the React Compiler, then a walk of what it emitted.
//
// A function or an object written into a JSX prop inside a `.map()` is a new
// value every time the block around it renders, so React re-renders every item
// in the list even when nothing about that item changed. The compiler cannot
// cache one: its slots are per component body, and a list has no slot per
// iteration. One keystroke re-rendering all forty keys of the on-screen
// keyboard was exactly this.
//
// Reading the compiler's output rather than the source is the whole point. The
// compiler hoists most inline props out of a list on its own, and a source-level
// reading reports more than twice as many as actually survive. Source line
// numbers are recovered by intersecting the two walks, because the output's
// positions belong to generated code.

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';

/** One prop a component allocates per item, per render. */
interface Alloc {
  file: string;
  prop: string;
  kind: 'function' | 'object';
  line: number;
}

const LIST = new Set(['map', 'flatMap']);

interface BabelNode {
  type: string;
  name?: { name?: string };
  value?: { type: string; expression?: { type: string } };
  loc?: { start?: { line?: number } };
  callee?: { type?: string; property?: { name?: string } };
}
interface BabelPath {
  node: BabelNode;
  parentPath?: BabelPath;
}
interface BabelCore {
  transformAsync(src: string, options: object): Promise<{ code?: string } | null>;
}

function kindOf(path: BabelPath): Alloc['kind'] | null {
  const value = path.node.value;
  if (value?.type !== 'JSXExpressionContainer') return null;
  const type = value.expression?.type;
  if (type === 'ArrowFunctionExpression' || type === 'FunctionExpression') return 'function';
  if (type === 'ObjectExpression' || type === 'ArrayExpression') return 'object';
  return null;
}

function insideList(path: BabelPath): boolean {
  for (let at = path.parentPath; at; at = at.parentPath) {
    const fn = at.node.type;
    const call = at.parentPath?.node;
    if (
      (fn === 'ArrowFunctionExpression' || fn === 'FunctionExpression') &&
      call?.type === 'CallExpression' &&
      call.callee?.type === 'MemberExpression' &&
      LIST.has(call.callee.property?.name ?? '')
    ) {
      return true;
    }
  }
  return false;
}

function collector(into: Alloc[], file: string) {
  return () => ({
    visitor: {
      JSXAttribute(path: BabelPath) {
        const kind = kindOf(path);
        if (!kind || !insideList(path)) return;
        into.push({
          file,
          prop: path.node.name?.name ?? '?',
          kind,
          line: path.node.loc?.start?.line ?? 0,
        });
      },
    },
  });
}

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const at = join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(at);
    else if (
      entry.name.endsWith('.tsx') &&
      !/\.(test|story|stories|demo|fixtures)\./.test(entry.name)
    )
      yield at;
  }
}

// Same trick as scripts/compiler-coverage.ts: the plugin belongs to
// @kroma/bundler, and babel itself is only reachable through the plugin's tree.
function babelOf(root: string) {
  const bundlerRequire = createRequire(resolve(root, 'packages/bundler/package.json'));
  const compiler = bundlerRequire.resolve('babel-plugin-react-compiler');
  const pluginRequire = createRequire(compiler);
  return {
    babel: pluginRequire('@babel/core') as BabelCore,
    compiler,
    presetTs: pluginRequire.resolve('@babel/preset-typescript'),
  };
}

/** Every prop the kit still allocates inside a list render once the compiler has
 * had its pass, with the line in the SOURCE that wrote it. */
async function scanKit(root: string): Promise<Alloc[]> {
  const { babel, compiler, presetTs } = babelOf(root);
  const src = resolve(root, 'packages/ui/src');
  const ts = {
    presets: [[presetTs, { isTSX: true, allExtensions: true }]],
    configFile: false,
    babelrc: false,
  };

  const out: Alloc[] = [];
  for (const file of sources(src)) {
    const code = readFileSync(file, 'utf8');
    const name = relative(resolve(root, 'packages/ui'), file);

    const written: Alloc[] = [];
    const survived: Alloc[] = [];
    try {
      await babel.transformAsync(code, {
        ...ts,
        filename: file,
        plugins: [collector(written, name)],
      });
      const compiled = await babel.transformAsync(code, {
        ...ts,
        filename: file,
        plugins: [[compiler, { target: '19' }]],
      });
      await babel.transformAsync(compiled?.code ?? '', {
        ...ts,
        filename: file,
        plugins: [collector(survived, name)],
      });
    } catch {
      continue;
    }

    // The output's line numbers are generated ones, so take the source's - as
    // many of each prop as the compiler left behind, topmost first.
    const budget = new Map<string, number>();
    for (const alloc of survived) {
      const key = `${alloc.prop}:${alloc.kind}`;
      budget.set(key, (budget.get(key) ?? 0) + 1);
    }
    for (const alloc of [...written].sort((a, b) => a.line - b.line)) {
      const key = `${alloc.prop}:${alloc.kind}`;
      const left = budget.get(key) ?? 0;
      if (left === 0) continue;
      budget.set(key, left - 1);
      out.push(alloc);
    }
  }
  return out;
}

export type { Alloc };
export { scanKit };
