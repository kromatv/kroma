/** A declaration's value. A number is written verbatim, so a unit is a string. */
type StyleValue = string | number;

type Declarations = Readonly<Record<string, StyleValue>>;

export interface StyleRule {
  readonly select: readonly string[];
  readonly declare: Declarations;
}

export interface GroupRule {
  readonly at: string;
  readonly rules: readonly StyleRule[];
}

export type SheetEntry = StyleRule | GroupRule;

export const rule = (select: string | readonly string[], declare: Declarations): StyleRule => ({
  select: typeof select === 'string' ? [select] : select,
  declare,
});

export const atMedia = (query: string, rules: readonly StyleRule[]): GroupRule => ({
  at: `@media ${query}`,
  rules,
});

/** An animation, its steps written as rules whose selector is the offset. */
export const keyframes = (name: string, steps: readonly StyleRule[]): GroupRule => ({
  at: `@keyframes ${name}`,
  rules: steps,
});

const kebab = (property: string) =>
  property.startsWith('--') ? property : property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const indent = (line: string) => (line === '' ? line : `  ${line}`);

const block = (head: string, body: readonly string[]) =>
  `${head} {\n${body
    .flatMap((part) => part.split('\n'))
    .map(indent)
    .join('\n')}\n}`;

const ruleCss = ({ select, declare }: StyleRule) =>
  block(
    select.join(',\n'),
    Object.entries(declare).map(([property, value]) => `${kebab(property)}: ${value};`),
  );

const isGroup = (entry: SheetEntry): entry is GroupRule => 'at' in entry;

const entryCss = (entry: SheetEntry) =>
  isGroup(entry) ? block(entry.at, entry.rules.map(ruleCss)) : ruleCss(entry);

export const sheetCss = (entries: readonly SheetEntry[]): string =>
  entries.map(entryCss).join('\n\n');
