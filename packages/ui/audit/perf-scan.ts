// The perf rules a rendered tree cannot show, read off the source.
//
// An audit that renders react-native-web in jsdom cannot see anything that only
// exists on a device: the native driver, a platform branch, an Animated value
// per row. These three are decidable from the source instead, so they run over
// any tree they are handed - which trees, and where the React Compiler lives,
// are the caller's business. Nothing here names a directory.

import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { type Babel, type SourceOptions, sourceFiles } from './source-scan';

interface BabelPath {
  node: { type: string };
}

type Rule =
  | 'js-driven-animation'
  | 'layout-animation'
  | 'js-fallback-animation'
  | 'identity-memo'
  | 'unstable-provider';

/** A directory to scan. `web` says the tree renders through react-native-web,
 *  which is what makes a missing web half a fault rather than a non-question. */
type Tree = string | { at: string; web?: boolean };

/** One perf fault, at the line that wrote it. */
interface Finding {
  rule: Rule;
  file: string;
  line: number;
  note: string;
}

const WHY: Record<Rule, string> = {
  'js-driven-animation':
    'runs every frame through JS for no reason: nothing it drives is a layout property, so the native driver would take it as it stands. Pass useNativeDriver: true.',
  'js-fallback-animation':
    'asks for the native driver in a file that never forks for the web. react-native-web has no native driver, so on the browser targets - Tizen, webOS, the Tauri shell - it silently becomes a JS rAF loop competing with React for the main thread, and warns once per animation. Fork the file (`.web.ts`) or branch on `WEB`, as lib/focus-transition and virtual-rail/moving-row do.',
  'layout-animation':
    'drives a layout property, which the native driver cannot take at all, so every frame is a JS round trip AND a Yoga pass. There is no flag for this: it is animate transform instead, or accept the cost. Investigated and declined is a fine answer - say so in the PR, not in a comment.',
  'identity-memo':
    'returns its own dependency, so it memoises nothing. A caller that reads it as stable - a context value, a prop on a memoised child - is rebuilt on every render.',
  'unstable-provider':
    'a context value is read PAST an unchanged element, so a fresh one re-renders every consumer in the subtree even when React would otherwise have bailed out.',
};

interface Node {
  type: string;
  loc?: { start?: { line?: number } };
  key?: { type?: string; name?: string; value?: string };
  value?: { type?: string; value?: unknown; expression?: Node };
  body?: Node;
  params?: unknown[];
  callee?: {
    type?: string;
    name?: string;
    object?: { name?: string };
    property?: { name?: string };
  };
  arguments?: Node[];
  name?: { type?: string; name?: string; object?: { name?: string }; property?: { name?: string } };
  openingElement?: { attributes?: Node[] };
}

const lineOf = (node: Node): number => node.loc?.start?.line ?? 0;

// What the native driver has no node for. Animating one of these is not a flag
// left unset, it is a different animation - which is why it is its own rule
// rather than a fault to be cleared.
const LAYOUT = new Set(['left', 'top', 'right', 'bottom', 'width', 'height', 'strokeDashoffset']);

// Read per file, not per call: the driver flag and the style it ends up on are
// written apart from each other (one `const eased` spread into every call), so
// the question "could this have been native?" is only answerable file-wide.
function layoutBound(node: Node): string | null {
  if (node.type !== 'ObjectProperty') return null;
  const key = node.key?.name ?? node.key?.value ?? '';
  if (!LAYOUT.has(key)) return null;
  const held = node.value?.type ?? '';
  return held === 'Identifier' || held === 'MemberExpression' || held === 'CallExpression'
    ? key
    : null;
}

// The literal `false` is unambiguous, and it is how the codebase writes it: one
// `const eased = { ..., useNativeDriver: false }` spread into every call in the
// file. Resolving the spread would find the same lines and be able to be wrong.
function nativeDriverOff(node: Node): boolean {
  return (
    node.type === 'ObjectProperty' &&
    (node.key?.name ?? node.key?.value) === 'useNativeDriver' &&
    node.value?.type === 'BooleanLiteral' &&
    node.value.value === false
  );
}

function nativeDriverOn(node: Node): boolean {
  return (
    node.type === 'ObjectProperty' &&
    (node.key?.name ?? node.key?.value) === 'useNativeDriver' &&
    node.value?.type === 'BooleanLiteral' &&
    node.value.value === true
  );
}

function identityMemo(node: Node): boolean {
  if (node.callee?.type !== 'Identifier' || node.callee.name !== 'useMemo') return false;
  const fn = node.arguments?.[0];
  return fn?.type === 'ArrowFunctionExpression' && fn.body?.type === 'Identifier';
}

function providerValue(node: Node): Node | null {
  const name = node.openingElement
    ? ((node as { openingElement?: { name?: { property?: { name?: string } } } }).openingElement
        ?.name?.property?.name ?? null)
    : null;
  if (name !== 'Provider') return null;
  for (const attr of node.openingElement?.attributes ?? []) {
    if (attr.type !== 'JSXAttribute' || attr.name?.name !== 'value') continue;
    const held = attr.value?.type === 'JSXExpressionContainer' ? attr.value.expression : null;
    const kind = held?.type ?? '';
    if (/^(Object|Array|ArrowFunction|Function)Expression$/.test(kind)) return attr as Node;
  }
  return null;
}

function collector(into: Finding[], file: string, forked = true) {
  const driven: number[] = [];
  const native: number[] = [];
  const layout = new Set<string>();
  return () => ({
    post() {
      if (!forked) {
        for (const line of native) {
          into.push({
            rule: 'js-fallback-animation',
            file,
            line,
            note: 'useNativeDriver: true, with no web half',
          });
        }
      }
      const why = [...layout].sort((a, b) => a.localeCompare(b));
      for (const line of driven) {
        into.push(
          why.length > 0
            ? { rule: 'layout-animation', file, line, note: `layout bound here: ${why.join(', ')}` }
            : { rule: 'js-driven-animation', file, line, note: 'useNativeDriver: false' },
        );
      }
    },
    visitor: {
      ObjectProperty(path: BabelPath) {
        const node = path.node as unknown as Node;
        if (nativeDriverOff(node)) driven.push(lineOf(node));
        if (nativeDriverOn(node)) native.push(lineOf(node));
        const bound = layoutBound(node);
        if (bound) layout.add(bound);
      },
      CallExpression(path: BabelPath) {
        const node = path.node as unknown as Node;
        if (identityMemo(node)) {
          into.push({
            rule: 'identity-memo',
            file,
            line: lineOf(node),
            note: 'useMemo returning its own dependency',
          });
        }
      },
      JSXElement(path: BabelPath) {
        const node = path.node as unknown as Node;
        const attr = providerValue(node);
        if (attr) {
          into.push({
            rule: 'unstable-provider',
            file,
            line: lineOf(attr),
            note: 'value is built during render',
          });
        }
      },
    },
  });
}

// Whether a file has already answered for the web: a `.web.*` twin beside it, a
// branch on WEB / Platform.OS inside it, or a name that says it is the native
// half of a pair. Read off the text rather than the AST because a guard can be
// spelled a dozen ways and a false NEGATIVE here is the safe direction - it
// reports nothing.
const WEB_AWARE = /\bWEB\b|Platform\.OS/;
const NATIVE_HALF = /(^|[./-])native[.-]/;

function forkedForWeb(file: string, code: string): boolean {
  const cut = file.lastIndexOf('.');
  const twin = `${file.slice(0, cut)}.web${file.slice(cut)}`;
  return existsSync(twin) || NATIVE_HALF.test(file) || WEB_AWARE.test(code);
}

/** What one snippet carries. `scanTrees` is what a caller wants; this is what
 *  the scanner's own tests drive. */
async function scanText(
  at: Babel,
  code: string,
  name = 'source.tsx',
  web = false,
): Promise<Finding[]> {
  const found: Finding[] = [];
  const forked = !web || forkedForWeb(resolve(name), code);
  await at.core.transformAsync(code, at.parse(resolve(name), [collector(found, name, forked)]));
  return found;
}

/** Every perf fault the source carries, in the trees it is handed. Paths are
 *  reported relative to `root`. */
async function scanTrees(
  at: Babel,
  root: string,
  trees: readonly Tree[],
  options?: SourceOptions,
): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const entry of trees) {
    const tree = typeof entry === 'string' ? entry : entry.at;
    // `js-fallback-animation` only means anything where the tree renders through
    // react-native-web. On a tree that is only ever native - a phone - asking for
    // the native driver is simply correct, and reporting it would be crying wolf.
    const web = typeof entry === 'string' ? false : (entry.web ?? false);
    const dir = resolve(root, tree);
    let files: string[] = [];
    try {
      files = [...sourceFiles(dir, options)];
    } catch {
      continue;
    }
    for (const file of files) {
      const found: Finding[] = [];
      try {
        const code = readFileSync(file, 'utf8');
        await at.core.transformAsync(
          code,
          at.parse(file, [
            collector(found, relative(root, file), !web || forkedForWeb(file, code)),
          ]),
        );
      } catch {
        continue;
      }
      out.push(...found);
    }
  }
  return out;
}

export type { Finding, Rule, Tree };
export { scanText, scanTrees, WHY };
