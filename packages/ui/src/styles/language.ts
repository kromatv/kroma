import { rule, type SheetEntry } from './sheet.ts';

const WORD_BREAK: Readonly<Record<string, string>> = {
  ko: 'keep-all',
  ja: 'auto-phrase',
};

export const LANGUAGE: readonly SheetEntry[] = Object.entries(WORD_BREAK).map(([code, wordBreak]) =>
  rule(`html:lang(${code})`, { wordBreak }),
);
