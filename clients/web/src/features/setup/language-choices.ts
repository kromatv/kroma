/** One language the setup offers: its code, its name in that language, and
 * its name in the language the interface speaks now. */
export interface LanguageChoice {
  code: string;
  native: string;
  label: string;
}

function folded(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function primary(tag: string): string {
  return tag.toLowerCase().split('-')[0] ?? '';
}

/** The offered codes a browser asks for, in the browser's own order: an exact
 * tag first, else the first offered code of the same language. */
export function preferredCodes(offered: readonly string[], browser: readonly string[]): string[] {
  const found = browser.flatMap((tag) => {
    const exact = offered.find((code) => code.toLowerCase() === tag.toLowerCase());
    return exact ?? offered.find((code) => primary(code) === primary(tag)) ?? [];
  });
  return [...new Set(found)];
}

/** The choices with the preferred ones on top, in their given order, and
 * every other one after them by its own name. */
export function orderedChoices(
  choices: readonly LanguageChoice[],
  preferred: readonly string[],
): LanguageChoice[] {
  const top = preferred.flatMap((code) => choices.find((choice) => choice.code === code) ?? []);
  const rest = choices.filter((choice) => !preferred.includes(choice.code));
  rest.sort((a, b) => a.native.localeCompare(b.native));
  return [...top, ...rest];
}

/** The choices a search keeps: the ones whose name, in either language, or
 * whose code holds what was typed, whatever its case or its accents. */
export function matchingChoices(
  choices: readonly LanguageChoice[],
  typed: string,
): LanguageChoice[] {
  const wanted = folded(typed.trim());
  if (!wanted) {
    return [...choices];
  }
  return choices.filter((choice) =>
    [choice.native, choice.label, choice.code].some((name) => folded(name).includes(wanted)),
  );
}
