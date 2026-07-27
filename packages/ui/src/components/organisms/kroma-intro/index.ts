// The folder IS the component: this is what lets the level barrel keep importing
// './kroma-intro' while the implementation is split per platform (a real <video>
// on the web, nothing on a television - see the two files).

export { EXIT_MS, SAFETY_SLACK_MS } from './constants';
export type { KromaIntroProps } from './kroma-intro';
export { KromaIntro } from './kroma-intro';
