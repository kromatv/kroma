import { ask } from '../server/host';

const MACHINERY = /\/(packages\/(i18n|i18n-devtools|ui)|node_modules|\.vite)\//;
const URL_AT = /(?:https?:)?\/\//;
const POSITION = /^\d+$/;

/** Where a string is written. `line` is the module the browser was served
 *  until the dev server says where that came from, which it can and the
 *  browser cannot: a stack trace is never mapped back through a transform. */
export interface Origin {
  readonly url: string;
  readonly line: number;
  readonly column: number;
  readonly file: string;
  readonly source: boolean;
}

const known = new Map<string, Origin | null>();
const asked = new Map<string, Promise<Origin | null>>();
const listeners = new Set<() => void>();

// Thrown by nobody: the stack is the answer, and the message only says so to a
// reader who finds one in a log.
const STACK_PROBE = 'kroma i18n devtools: where a string is written';

function servedAt(url: string): string {
  // Found rather than matched: a pattern for the query would scan the whole URL
  // to decide there is none, on every text node the overlay grades.
  const query = url.indexOf('?');
  const path = query === -1 ? url : url.slice(0, query);
  return path.replace(/^https?:\/\/[^/]+/, '');
}

function fileOf(url: string): string {
  const path = servedAt(url);
  return path.startsWith('/@fs') ? path.slice(4) : path;
}

// A frame ends in `:line:column`, and everything before it is the URL. Read
// from the end rather than matching the whole line at once: a URL may hold any
// number of colons, so one pattern over the lot backtracks through every one of
// them on a line that turns out not to be a frame.
function frameOf(line: string): { url: string; line: number; column: number } | null {
  const text = line.trim().replace(/\)$/, '');
  const start = text.search(URL_AT);
  if (start === -1) return null;
  const at = text.slice(start);
  const lastColon = at.lastIndexOf(':');
  const firstColon = at.lastIndexOf(':', lastColon - 1);
  if (firstColon < 1) return null;
  const row = at.slice(firstColon + 1, lastColon);
  const column = at.slice(lastColon + 1);
  if (!POSITION.test(row) || !POSITION.test(column)) return null;
  return { url: at.slice(0, firstColon), line: Number(row), column: Number(column) };
}

/** The first frame of `stack` that is the screen rather than the machinery.
 *  `Error.stack` is optional by spec, and an engine that omits it leaves the
 *  tools nothing to read. */
export function screenFrame(stack: string | undefined): Origin | null {
  for (const line of (stack ?? '').split('\n').slice(1)) {
    const at = frameOf(line);
    if (!at || MACHINERY.test(at.url)) continue;
    return {
      url: servedAt(at.url),
      line: at.line,
      column: at.column,
      file: fileOf(at.url),
      source: false,
    };
  }
  return null;
}

/** How a person reads it: `who.tsx:42`. */
export function labelOf(origin: Origin): string {
  return `${origin.file.slice(origin.file.lastIndexOf('/') + 1)}:${origin.line}`;
}

/** The file and line to hand an editor. */
export function fileOfOrigin(origin: Origin): string {
  return `${origin.file}:${origin.line}:${origin.column}`;
}

function announce(): void {
  for (const listener of listeners) listener();
}

/**
 * Ask the dev server where a served position was written, once per position.
 *
 * Until it answers, the served line stands: it names the right file and is
 * near enough to read, and every transform between the file and the browser
 * moves it - React Compiler by a dozen lines either way.
 */
export function sourceOrigin(origin: Origin): Origin {
  if (origin.source) return origin;
  const at = `${origin.url}|${origin.line}|${origin.column}`;
  const hit = known.get(at);
  if (hit !== undefined) return hit ?? origin;
  if (!asked.has(at)) {
    asked.set(
      at,
      ask('kroma:i18n:where', { url: origin.url, line: origin.line, column: origin.column }).then(
        (answer) => {
          const mapped = answer?.line ? { ...origin, line: answer.line, source: true } : null;
          known.set(at, mapped);
          announce();
          return mapped;
        },
      ),
    );
  }
  return origin;
}

/** Told when a position the panel is drawing has been traced back. */
export function onOriginTraced(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function originOf(key: string): Origin | null {
  const hit = seen.get(key);
  if (hit !== undefined) return hit;
  const found = screenFrame(new Error(STACK_PROBE).stack);
  seen.set(key, found);
  return found;
}

const seen = new Map<string, Origin | null>();

interface Fiber {
  return?: Fiber | null;
  _debugStack?: { stack?: string } | null;
}

function fiberOf(element: Element | null): Fiber | null {
  if (!element) return null;
  const key = Object.keys(element).find((name) => name.startsWith('__reactFiber$'));
  return key ? ((Reflect.get(element, key) as Fiber) ?? null) : null;
}

/** Where the component drawing `node` was written, read off React's own debug
 *  stacks: for text no catalog ever saw, the tree that drew it is the only
 *  witness. Read on hover only. */
export function originAt(node: Node): Origin | null {
  let fiber = fiberOf(node.parentElement);
  for (let up = 0; fiber && up < 24; up += 1) {
    const found = screenFrame(fiber._debugStack?.stack);
    if (found) return found;
    fiber = fiber.return ?? null;
  }
  return null;
}
