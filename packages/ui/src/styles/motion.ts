import { keyframes, rule, type SheetEntry } from './sheet.ts';

// A rule rather than an opacity driven from React: the resting state has to be
// VISIBLE, or already-decoded art never gets revealed.
const IMG_IN = keyframes('kroma-img-in', [
  rule('from', { opacity: 0 }),
  rule('to', { opacity: 1 }),
]);

const BREATHE = keyframes('kroma-breathe', [
  rule(['0%', '100%'], { opacity: 0.45 }),
  rule('50%', { opacity: 0.85 }),
]);

const FADE_IN = keyframes('fade-in', [rule('from', { opacity: 0 }), rule('to', { opacity: 1 })]);

const POP_IN = keyframes('pop-in', [
  rule('from', { opacity: 0, transform: 'translate(-50%, -50%) scale(0.96)' }),
  rule('to', { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }),
]);

export const MOTION: readonly SheetEntry[] = [IMG_IN, BREATHE, FADE_IN, POP_IN];
