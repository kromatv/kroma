import { engine } from './engine';

const RULES = new Map<string, Intl.PluralRules | null>();

function rulesFor(locale: string): Intl.PluralRules | null {
  const known = RULES.get(locale);
  if (known !== undefined) return known;
  let made: Intl.PluralRules | null = null;
  try {
    made = new Intl.PluralRules(locale);
  } catch {
    made = null;
  }
  RULES.set(locale, made);
  return made;
}

/** The plural category `count` falls in, as the engine names it where it says
 *  and as CLDR does otherwise. */
export function categoryOf(locale: string, count: number): string {
  const said = engine().categoryOf?.(locale, count);
  if (said) return said;
  return rulesFor(locale)?.select(count) ?? (count === 1 ? 'one' : 'other');
}
