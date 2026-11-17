const SHOWN = 3;
const LOOKED_AT = 200;

/** A few counts below 200 that take plural form `category` in `locale`, as a reader would list them: `1`, `2, 3, 4…`. Empty when none does. */
export function pluralExamples(locale: string, category: string): string {
  let rules: Intl.PluralRules;
  try {
    rules = new Intl.PluralRules(locale);
  } catch {
    return '';
  }
  const counts: number[] = [];
  for (let n = 0; n < LOOKED_AT && counts.length <= SHOWN; n += 1) {
    if (rules.select(n) === category) {
      counts.push(n);
    }
  }
  const listed = counts.slice(0, SHOWN).join(', ');
  return counts.length > SHOWN ? `${listed}…` : listed;
}

/** What a placeholder or a reference in a message is, for the hint over its chip; a `plural` form may write its count out. */
export function placeableHint(
  part: { kind: 'placeholder' | 'ref'; name: string },
  { plural }: { plural: boolean },
): string {
  if (part.kind === 'ref') {
    return `Inserts the message ${part.name}. Keep it as written.`;
  }
  if (part.name === 'count') {
    return plural
      ? 'Replaced by a number when shown. This form may write the number out instead.'
      : 'Replaced by a number when shown. Keep it as written.';
  }
  return 'Replaced when shown, e.g. by a name or a number. Keep it as written.';
}
