import { atMedia, keyframes, rule, type SheetEntry, sheetCss } from '#ui/styles/sheet';

const ANIMATIONS: readonly SheetEntry[] = [
  keyframes('kroma-tagIn', [
    rule('0%', { opacity: 0, letterSpacing: '.2em' }),
    rule('100%', { opacity: 1, letterSpacing: '.42em' }),
  ]),
  atMedia('(prefers-reduced-motion: reduce)', [
    rule('.kroma-intro *', {
      animationDuration: '.01ms !important',
      animationIterationCount: '1 !important',
      transitionDuration: '.01ms !important',
    }),
  ]),
];

/** The film's stylesheet, for the `<style>` its shell mounts. */
export const KEYFRAMES = sheetCss(ANIMATIONS);
