// `kroma-breathe` is deliberately the name the kit's sheet also declares, at a
// narrower range: this sheet is injected after it, so the intro's glow breathes
// its own way for as long as the film is on screen.

import { atMedia, keyframes, rule, type SheetEntry, sheetCss } from '#ui/styles/sheet';

const fade = (from: number, to: number) => [
  rule('from', { opacity: from }),
  rule('to', { opacity: to }),
];

const spin = (from: string, to: string) => [
  rule('from', { transform: `rotate(${from})` }),
  rule('to', { transform: `rotate(${to})` }),
];

const ANIMATIONS: readonly SheetEntry[] = [
  keyframes('kroma-igniteGlow', [
    rule('from', { opacity: 0, transform: 'scale(.5)' }),
    rule('to', { opacity: 0.5, transform: 'scale(1)' }),
  ]),
  keyframes('kroma-igniteGlowLite', fade(0, 0.5)),
  keyframes('kroma-breathe', [
    rule(['0%', '100%'], { opacity: 0.38 }),
    rule('50%', { opacity: 0.62 }),
  ]),
  keyframes('kroma-segIn', fade(0, 1)),
  keyframes('kroma-wheelSpin', spin('-150deg', '0deg')),
  keyframes('kroma-wheelIdle', spin('0deg', '360deg')),
  keyframes('kroma-hubPulse', [
    rule('0%', { opacity: 0, transform: 'scale(.4)' }),
    rule('45%', { opacity: 0.9, transform: 'scale(1.15)' }),
    rule('100%', { opacity: 0, transform: 'scale(1.7)' }),
  ]),
  keyframes('kroma-shock', [
    rule('0%', { opacity: 0.75, transform: 'scale(.55)' }),
    rule('100%', { opacity: 0, transform: 'scale(2.5)' }),
  ]),
  keyframes('kroma-flash', [
    rule('0%', { opacity: 0 }),
    rule('10%', { opacity: 0.9 }),
    rule('100%', { opacity: 0 }),
  ]),
  keyframes('kroma-blackIn', [rule('0%', { opacity: 1 }), rule('100%', { opacity: 0 })]),
  keyframes('kroma-punch', [
    rule('0%', { transform: 'scale(.985)' }),
    rule('38%', { transform: 'scale(1.035)' }),
    rule('100%', { transform: 'scale(1)' }),
  ]),
  keyframes('kroma-wordReveal', [
    rule('0%', {
      opacity: 0,
      transform: 'translateY(16px) scale(.8)',
      filter: 'blur(16px)',
      textShadow: '0 0 0 rgba(242,180,66,0)',
    }),
    rule('45%', {
      opacity: 1,
      transform: 'translateY(0) scale(1.06)',
      filter: 'blur(0)',
      textShadow: '0 0 30px rgba(255,214,98,.9)',
    }),
    rule('68%', { transform: 'scale(.99)' }),
    rule('100%', {
      opacity: 1,
      transform: 'scale(1)',
      textShadow: '0 0 14px rgba(242,180,66,.28)',
    }),
  ]),
  keyframes('kroma-wordRevealLite', [
    rule('0%', { opacity: 0, transform: 'translateY(16px) scale(.84)' }),
    rule('55%', { opacity: 1, transform: 'translateY(0) scale(1.05)' }),
    rule('75%', { transform: 'scale(.99)' }),
    rule('100%', { opacity: 1, transform: 'scale(1)' }),
  ]),
  keyframes('kroma-tagIn', [
    rule('0%', { opacity: 0, letterSpacing: '.2em' }),
    rule('100%', { opacity: 1, letterSpacing: '.42em' }),
  ]),
  keyframes('kroma-ember', [
    rule('0%', { opacity: 0, transform: 'translateY(0) scale(.5)' }),
    rule('18%', { opacity: 0.7 }),
    rule('100%', { opacity: 0, transform: 'translateY(-46vmin) scale(1.1)' }),
  ]),
  keyframes('kroma-flicker', [
    rule(['0%', '100%'], { opacity: 1 }),
    rule('48%', { opacity: 0.86 }),
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
