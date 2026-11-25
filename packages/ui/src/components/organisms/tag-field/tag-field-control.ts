import { defineControl, typed } from '#ui/lib/control';

const NONE: readonly string[] = [];

const MARKS = /\p{M}/gu;
const SPACES = /\s+/g;

/** A name as two names are compared: no case, no accents, no outer or doubled
 *  spaces. */
function foldName(name: string): string {
  return name.normalize('NFD').replace(MARKS, '').replace(SPACES, ' ').trim().toLowerCase();
}

/** Whether `names` already holds `name`, compared folded. */
function holds(names: readonly string[], name: string): boolean {
  const folded = foldName(name);
  return names.some((held) => foldName(held) === folded);
}

function withNames(
  value: readonly string[],
  names: readonly string[],
  max: number,
): readonly string[] {
  const next = [...value];
  for (const name of names.map((raw) => raw.trim())) {
    if (next.length >= max) {
      break;
    }
    if (name !== '' && !holds(next, name)) {
      next.push(name);
    }
  }
  return next.length === value.length ? value : next;
}

interface Typing {
  value: readonly string[];
  query: string;
  max: number;
}

function afterTyping(now: Typing, text: string) {
  const parts = text.trimStart().split(',');
  if (parts.length === 1) {
    return { query: parts[0] ?? '', open: true };
  }
  const pasted = text.length - now.query.length > 1;
  const rest = pasted ? '' : (parts.pop() ?? '').trimStart();
  return { value: withNames(now.value, parts, now.max), query: rest, open: true };
}

/** The names of a <TagField.Root>, what is typed after them, and whether the
 *  suggestions are open. A comma typed closes a name, and a paste that holds
 *  one is all names. */
const tagFieldControl = defineControl('tag-field', {
  state: { value: typed<readonly string[]>(NONE), query: '', open: false },
  options: { max: Number.POSITIVE_INFINITY },
  actions: {
    type: (now, text: string) => afterTyping(now, text),
    add: ({ value, max }, name: string) => {
      const next = withNames(value, [name], max);
      return next === value ? {} : { value: next, query: '' };
    },
    remove: ({ value }, name: string) =>
      value.includes(name) ? { value: value.filter((held) => held !== name) } : {},
  },
  reasons: ['trigger', 'picked', 'outside', 'escape', 'back'],
});

export { foldName, holds, NONE, tagFieldControl };
