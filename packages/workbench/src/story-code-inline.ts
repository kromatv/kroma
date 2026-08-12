// A scene authored as `(args) => (<jsx>)` is a function because that is how the
// controls reach it, but the function is the workbench's plumbing and not
// something a reader wants to copy. Shown here it becomes the JSX alone, with
// the args it was called with written in, so the block on screen is the block
// that drew the canvas.
//
// Conservative by construction: anything this cannot account for is left
// exactly as the author wrote it, because a half-rewritten example is worse
// than an honest one.

interface Head {
  names: string[];
  /** The parameter that IS the whole args bag, when there is one. */
  bag: string | null;
  /** Whether the arrow genuinely took nothing, as against a list unread. */
  empty: boolean;
  end: number;
}

const NAME = /^[A-Za-z_$][\w$]*$/;

// The parameter list, when the source opens with an arrow that takes one. Only
// the two shapes a story can be written in: a destructured bag, or one name.
function head(code: string): Head | null {
  if (code.startsWith('(')) {
    const close = matching(code, 0, '(');
    if (close < 0) return null;
    const arrow = code.slice(close + 1).match(/^\s*=>\s*/);
    if (!arrow) return null;
    const params = binding(code.slice(1, close));
    return {
      names: destructured(params),
      bag: whole(params),
      empty: params === '',
      end: close + 1 + arrow[0].length,
    };
  }
  const single = code.match(/^([A-Za-z_$][\w$]*)\s*=>\s*/);
  if (!single?.[1]) return null;
  return { names: [single[1]], bag: single[1], empty: false, end: single[0].length };
}

// The parameter without its type, since a story may write `(args: Args) =>` and
// what is bound is the part before the colon.
function binding(params: string): string {
  const text = params.trim();
  if (text.startsWith('{')) {
    const close = matching(text, 0, '{');
    return close < 0 ? text : text.slice(0, close + 1);
  }
  return text.match(/^[A-Za-z_$][\w$]*/)?.[0] ?? text;
}

function destructured(params: string): string[] {
  if (NAME.test(params)) return [params];
  if (!params.startsWith('{') || !params.endsWith('}')) return [];
  return params
    .slice(1, -1)
    .split(',')
    .map((part) => part.replace(/[:=][\s\S]*$/, '').trim())
    .filter((name) => NAME.test(name));
}

// `(props) => ... {...props}` spreads the whole bag, so the attributes it stands
// for are the args themselves. A REST of a destructured bag is not this: what it
// holds is whatever was not named, which the source alone does not say.
function whole(params: string): string | null {
  return NAME.test(params.trim()) ? params.trim() : null;
}

function attributes(args: Record<string, unknown>): string | null {
  const out: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === '') continue;
    if (value === true) out.push(key);
    else {
      const written = asAttribute(value);
      if (written === null) return null;
      out.push(`${key}=${written}`);
    }
  }
  return out.join(' ');
}

// The index of the bracket closing the one at `from`, ignoring anything inside
// a string or a template, or -1 when it never closes.
function matching(text: string, from: number, open: '(' | '{'): number {
  const shut = open === '(' ? ')' : '}';
  let depth = 0;
  let quote = '';
  for (let at = from; at < text.length; at += 1) {
    const char = text[at];
    if (quote) {
      if (char === '\\') at += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') quote = char;
    else if (char === open) depth += 1;
    else if (char === shut) {
      depth -= 1;
      if (depth === 0) return at;
    }
  }
  return -1;
}

function body(rest: string): string | null {
  const text = rest.trim();
  // A block body runs statements before it returns anything, so there is no
  // single expression to show in its place.
  if (text.startsWith('{')) return null;
  if (!text.startsWith('(')) return text;
  const close = matching(text, 0, '(');
  return close === text.length - 1 ? dedent(text.slice(1, close)) : text;
}

function dedent(text: string): string {
  const lines = text.replace(/^\n/, '').trimEnd().split('\n');
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => line.length - line.trimStart().length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(cut)).join('\n');
}

// How a value is written back into the JSX it came from: as an attribute it
// keeps its braces unless it is a string, and as a child it is just the text.
function asAttribute(value: unknown): string | null {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return `{${String(value)}}`;
  return null;
}

function asChild(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function truthy(value: unknown): boolean {
  return Boolean(value) && value !== '';
}

interface Hole {
  inner: string;
  attribute: boolean;
}

// One `{...}` container, and whether it sits after an `=` (an attribute value)
// or between tags (a child).
function holeAt(text: string, open: number): Hole | null {
  const close = matching(text, open, '{');
  if (close < 0) return null;
  let before = open - 1;
  while (before >= 0 && text[before] === ' ') before -= 1;
  return { inner: text.slice(open + 1, close), attribute: text[before] === '=' };
}

interface Written {
  text: string;
  /** A branch kept from a conditional, which may hold args of its own. */
  nested: boolean;
}

function resolve(
  hole: Hole,
  names: readonly string[],
  bag: string | null,
  args: Record<string, unknown>,
): Written | null {
  const inner = hole.inner.trim();
  if (bag && inner === `...${bag}`) {
    const written = attributes(args);
    return written === null ? null : { text: written, nested: false };
  }
  if (names.includes(inner)) {
    const written = hole.attribute ? asAttribute(args[inner]) : asChild(args[inner]);
    return written === null ? null : { text: written, nested: false };
  }
  // `{flag ? <Thing /> : null}`: the one conditional a story writes, and the
  // canvas has already decided which way it went.
  const ternary = inner.match(/^([A-Za-z_$][\w$]*)\s*\?([\s\S]+):([\s\S]+)$/);
  const name = ternary?.[1];
  if (!name || !names.includes(name)) return null;
  const taken = ((truthy(args[name]) ? ternary[2] : ternary[3]) as string).trim();
  const empty = taken === 'null' || taken === 'undefined';
  return { text: empty ? '' : taken, nested: !empty };
}

interface Pass {
  text: string;
  /** Whether every reference to a parameter was written back. */
  whole: boolean;
}

function substitute(
  text: string,
  names: readonly string[],
  bag: string | null,
  args: Record<string, unknown>,
): Pass {
  let out = '';
  let at = 0;
  let entire = true;
  while (at < text.length) {
    const open = text.indexOf('{', at);
    if (open < 0) {
      out += text.slice(at);
      break;
    }
    const hole = holeAt(text, open);
    if (!hole) {
      out += text.slice(at);
      entire = false;
      break;
    }
    const close = open + hole.inner.length + 2;
    const written = resolve(hole, names, bag, args);
    if (written === null) {
      // A spread left standing is always incomplete: it holds props the markup
      // never names, so what is on screen is not the whole call.
      if (hole.inner.trim().startsWith('...') || mentions(hole.inner, names, bag)) {
        entire = false;
      }
      out += text.slice(at, close);
    } else if (written.nested) {
      const inner = substitute(written.text, names, bag, args);
      entire = entire && inner.whole;
      out += text.slice(at, open) + inner.text;
    } else {
      out += text.slice(at, open) + written.text;
    }
    at = close;
  }
  return { text: out, whole: entire };
}

// Whether an expression this could not write back still leans on a parameter,
// which is what makes the result code with a free name in it.
function mentions(inner: string, names: readonly string[], bag: string | null): boolean {
  const all = bag ? [...names, bag] : names;
  return all.some((name) => new RegExp(`(^|[^\\w$.])${name}([^\\w$]|$)`).test(inner));
}

// A line left holding nothing after a conditional resolved away, which would
// otherwise show as a blank gap. Only those: a blank line the author wrote is
// spacing they meant, so it is kept, and the two are told apart by comparing
// against the source line by line.
function tidy(before: string, after: string): string {
  const was = before.split('\n');
  const now = after.split('\n');
  if (was.length !== now.length) return after;
  return now.filter((line, at) => line.trim() || !was[at]?.trim()).join('\n');
}

/**
 * The code to show for a scene, given the args the canvas drew it with: the
 * arrow the story format requires is removed and its parameters written in.
 * Source this cannot account for is returned unchanged.
 */
function inlineArgs(code: string | undefined, args: Record<string, unknown>): string | null {
  return unwrap(code, args)?.text ?? null;
}

/**
 * The same, but only when there was a function AND every parameter was written
 * back. Markup that took no args cannot follow a control, and a render spreading
 * a bag this cannot account for would name things that are not there; both are
 * better shown as a generated call site.
 */
function fullyInlined(code: string | undefined, args: Record<string, unknown>): string | null {
  const done = unwrap(code, args);
  return done?.whole ? done.text : null;
}

function unwrap(code: string | undefined, args: Record<string, unknown>): Pass | null {
  if (!code) return null;
  const at = head(code);
  if (!at) return { text: code, whole: false };
  const inner = body(code.slice(at.end));
  if (inner === null) return { text: code, whole: false };
  // A parameterless arrow has nothing to write in and is whole as it stands; a
  // parameter list this could not read is not, and must not pass as one.
  if (!at.names.length && !at.bag) return { text: inner, whole: at.empty };
  const done = substitute(inner, at.names, at.bag, args);
  return { text: tidy(inner, done.text), whole: done.whole };
}

export { fullyInlined, inlineArgs };
