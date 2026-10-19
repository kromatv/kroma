import { atSupports, keyframes, rule, type SheetEntry } from './sheet.ts';

const IMG_WAIT = rule('img[data-kroma-reveal="wait"]', {
  opacity: 0,
  animation: 'kroma-img-failsafe 1ms linear 2500ms forwards',
});

const IMG_SHOWN = rule(['img[data-kroma-reveal="in"]', 'img[data-kroma-reveal="shown"]'], {
  opacity: 1,
});

const IMG_FAILSAFE = keyframes('kroma-img-failsafe', [rule('to', { opacity: 1 })]);

const UNIT = '[data-kroma-fade-unit]';

const WAITING = 'img[data-kroma-reveal="wait"]';

const UNIT_FAILSAFE = keyframes('kroma-unit-failsafe', [
  rule('to', { opacity: 1, visibility: 'visible' }),
]);

const FADE_UNIT = atSupports('selector(:has(a))', [
  rule(UNIT, {
    willChange: 'opacity',
    transitionProperty: 'opacity, visibility',
    transitionDuration: '400ms',
    transitionTimingFunction: 'ease',
  }),
  rule(`${UNIT}:has(${WAITING})`, {
    opacity: 0,
    visibility: 'hidden',
    animation: 'kroma-unit-failsafe 1ms linear 1500ms forwards',
  }),
  rule(`${UNIT} img[data-kroma-reveal]`, { opacity: 1, animation: 'none', transition: 'none' }),
  rule(`:has(> ${UNIT}):not(:has(> ${UNIT} ${WAITING}))`, {
    backgroundColor: 'transparent',
    transition: 'background-color 0s linear 400ms',
  }),
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

export const MOTION: readonly SheetEntry[] = [
  IMG_WAIT,
  IMG_SHOWN,
  IMG_FAILSAFE,
  UNIT_FAILSAFE,
  FADE_UNIT,
  BREATHE,
  FADE_IN,
  POP_IN,
];
