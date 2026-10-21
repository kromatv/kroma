// A scene authored as `(args) => (<jsx>)` is a function because that is how the
// controls reach it, but the function is the workbench's plumbing and not
// something a reader wants to copy. Shown here it becomes the JSX alone, with
// the args it was called with written in, so the block on screen is the block
// that drew the canvas.
//
// Conservative by construction: anything this cannot account for is left
// exactly as the author wrote it, because a half-rewritten example is worse
// than an honest one.

import { head } from './head';
import { matching } from './matching';
import { substitute, tidy, type Pass } from './substitute';

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
