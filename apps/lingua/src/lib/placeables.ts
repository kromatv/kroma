import { tokensIn } from '@kromatv/i18n';
import { REF } from '#site/core/checks';

/**
 * A run of a message: plain text, a `{placeholder}` the app fills in when it
 * shows the message, or a `$t(key)` reference that inserts another message.
 * `value` is the run as written, starting at `at`; `name` is the placeholder's
 * name or the key.
 */
export type Part =
  | { kind: 'text'; value: string; at: number }
  | { kind: 'placeholder' | 'ref'; value: string; name: string; at: number };

interface Found {
  at: number;
  part: Part;
}

function placeholdersIn(text: string): Found[] {
  const found: Found[] = [];
  let from = 0;
  for (const name of tokensIn(text)) {
    const value = `{${name}}`;
    const at = text.indexOf(value, from);
    found.push({ at, part: { kind: 'placeholder', value, name, at } });
    from = at + value.length;
  }
  return found;
}

function refsIn(text: string): Found[] {
  return [...text.matchAll(REF)].map((match) => ({
    at: match.index,
    part: { kind: 'ref', value: match[0], name: match[1] ?? '', at: match.index },
  }));
}

/** `text` cut into its runs, read with the rules the server checks a translation by. */
export function partsOf(text: string): Part[] {
  const found = [...placeholdersIn(text), ...refsIn(text)].sort((a, b) => a.at - b.at);
  const parts: Part[] = [];
  let from = 0;
  for (const { at, part } of found) {
    if (at > from) {
      parts.push({ kind: 'text', value: text.slice(from, at), at: from });
    }
    parts.push(part);
    from = at + part.value.length;
  }
  if (from < text.length) {
    parts.push({ kind: 'text', value: text.slice(from), at: from });
  }
  return parts;
}

/**
 * Where a placeholder stands in a translation: `present`, `missing` from it,
 * `optional` for the `{count}` a plural form may spell out, or `unknown` to
 * the source, which the server refuses.
 */
export type VariableState = 'present' | 'missing' | 'optional' | 'unknown';

/** One placeholder of a message, as the translation being typed uses it. */
export interface Variable {
  name: string;
  value: string;
  state: VariableState;
}

const unique = (names: readonly string[]) => [...new Set(names)];

/** The source's placeholders, then any the translation names that the source does not, each with where it stands; a `plural` form may leave `{count}` out. */
export function variablesOf(
  source: string,
  translation: string,
  { plural }: { plural: boolean },
): Variable[] {
  const expected = unique(tokensIn(source));
  const given = unique(tokensIn(translation));
  const relaxed = (name: string) => plural && name === 'count';
  const stateOf = (name: string): VariableState => {
    if (given.includes(name)) {
      return 'present';
    }
    return relaxed(name) ? 'optional' : 'missing';
  };
  return [
    ...expected.map((name) => ({ name, value: `{${name}}`, state: stateOf(name) })),
    ...given
      .filter((name) => !expected.includes(name) && !relaxed(name))
      .map((name): Variable => ({ name, value: `{${name}}`, state: 'unknown' })),
  ];
}

/** The placeholder to insert next: the first one missing, else the plural's optional `{count}`, else none. */
export function nextMissing(variables: readonly Variable[]): Variable | null {
  return (
    variables.find((v) => v.state === 'missing') ??
    variables.find((v) => v.state === 'optional') ??
    null
  );
}

/** A range of a text field, in UTF-16 code units. */
export interface Selection {
  start: number;
  end: number;
}

/** `value` with `token` in place of `selection`, or appended without one, and where the caret lands after it. */
export function insertAt(
  value: string,
  selection: Selection | null,
  token: string,
): { value: string; caret: number } {
  const clamp = (at: number) => Math.min(Math.max(at, 0), value.length);
  const start = clamp(selection?.start ?? value.length);
  const end = Math.max(start, clamp(selection?.end ?? value.length));
  return { value: value.slice(0, start) + token + value.slice(end), caret: start + token.length };
}
