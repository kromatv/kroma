import { conditional } from './conditional';
import { matching } from './matching';

const WORD_CHAR = new Set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$');

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
  const ternary = conditional(inner);
  if (!ternary || !names.includes(ternary.name)) return null;
  const taken = (truthy(args[ternary.name]) ? ternary.whenTrue : ternary.whenFalse).trim();
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
  return all.some((name) => holdsWord(inner, name));
}

// The name as a WHOLE word, and not as a property of something else: `props` is
// mentioned by `props.a`, but `a` is not mentioned by `props.a`.
function holdsWord(text: string, word: string): boolean {
  for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) {
    const before = text[at - 1];
    const after = text[at + word.length];
    if (before !== undefined && (WORD_CHAR.has(before) || before === '.')) continue;
    if (after !== undefined && WORD_CHAR.has(after)) continue;
    return true;
  }
  return false;
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

export type { Pass };
export { substitute, tidy };
