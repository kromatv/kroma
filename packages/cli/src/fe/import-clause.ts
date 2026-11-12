import { WHOLE_NAMESPACE } from '@kromatv/module-sdk/shared';

function splitAs(field: string): [string, string | undefined] {
  const words = field.split(' ').filter(Boolean);
  const as = words.indexOf('as');
  if (as < 0) return [words.join(''), undefined];
  return [words.slice(0, as).join(''), words.slice(as + 1).join('')];
}

/** `{ a, b as c }` → `[['a', undefined], ['b', 'c']]`. */
export function fieldsOf(braces: string): [string, string | undefined][] {
  return braces
    .slice(1, -1)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(splitAs);
}

/** The `{ ... }` group in an import clause, and the clause without it. */
export function takeBraces(clause: string): [string | null, string] {
  const open = clause.indexOf('{');
  const close = clause.indexOf('}');
  if (open < 0 || close < open) return [null, clause];
  return [clause.slice(open, close + 1), `${clause.slice(0, open)}${clause.slice(close + 1)}`];
}

/** The `* as ns` binding in an import clause, and the clause without it. */
export function takeNamespace(clause: string): [string | null, string] {
  const star = clause.indexOf('*');
  if (star < 0) return [null, clause];
  const [, ns] = splitAs(clause.slice(star + 1).split(',')[0] ?? '');
  const rest =
    clause.slice(0, star) +
    clause
      .slice(star + 1)
      .split(',')
      .slice(1)
      .join(',');
  return [ns ?? null, rest];
}

/** The names one static `import` or `export ... from` statement takes from its
 *  package: `default` for a default binding, `WHOLE_NAMESPACE` for `* as ns`
 *  and for a bare `import 'x'`, which needs the package present all the same. */
export function namesTaken(statement: string): string[] {
  const fromAt = statement.lastIndexOf(' from ');
  if (fromAt < 0) return [WHOLE_NAMESPACE];
  const head = statement.startsWith('export') ? 'export' : 'import';
  const [braces, afterBraces] = takeBraces(statement.slice(head.length, fromAt).trim());
  const names = braces ? fieldsOf(braces).map(([name]) => name) : [];
  const [ns, afterNs] = takeNamespace(afterBraces);
  if (ns) names.push(WHOLE_NAMESPACE);
  if (afterNs.replaceAll(',', '').trim()) names.push('default');
  return names;
}
