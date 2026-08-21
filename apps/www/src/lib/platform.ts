import type { TargetId } from '#site/lib/release-targets';

/** A visitor's own device, as far as a browser will admit to it. */
export interface Guess {
  /** The anchor of the family this device belongs to, for "show me the rest". */
  family: 'tv' | 'desktop' | 'mobile' | 'nas';
  /** What to offer first. Empty when the platform has no file to hand over. */
  targets: readonly TargetId[];
  /** The device's own name, for a button that says what it will download. */
  label: string;
}

const GUESSES: readonly (readonly [RegExp, Guess])[] = [
  // The two televisions that name themselves come first. A Tizen set also says
  // SMART-TV and an LG set also says Linux, so anything matching on a generic
  // token would take them from the package they can actually install.
  [/\btizen\b/i, { family: 'tv', targets: ['tizen'], label: 'Samsung' }],
  [/\bweb0s\b|\bwebos\b/i, { family: 'tv', targets: ['webos'], label: 'LG' }],

  // Then Android TV, before the phones: a television reports Android as well,
  // and one of these device tokens is all that separates them.
  [
    /\b(googletv|android tv|bravia|aft[mbtks]|crkey)\b/i,
    { family: 'tv', targets: ['androidtv'], label: 'Android TV' },
  ],

  // The iPad reports itself as a Mac on iPadOS 13+, so touch is what tells them
  // apart. Both go to the same TestFlight, so a wrong guess costs nothing.
  [/\b(iphone|ipad|ipod)\b/i, { family: 'mobile', targets: [], label: 'iPhone / iPad' }],
  [/\bandroid\b/i, { family: 'mobile', targets: ['android'], label: 'Android' }],

  [/\bmac os x\b|\bmacintosh\b/i, { family: 'desktop', targets: ['macos'], label: 'macOS' }],
  [
    /\bwindows\b/i,
    { family: 'desktop', targets: ['windows-exe', 'windows-msi'], label: 'Windows' },
  ],
  [
    /\b(x11|linux|ubuntu|fedora|debian)\b/i,
    { family: 'desktop', targets: ['linux-appimage', 'linux-deb'], label: 'Linux' },
  ],
];

/**
 * The device a user agent belongs to, or null when it says nothing useful.
 *
 * A guess, and treated as one everywhere it is used: it puts the likely file
 * first and never removes anything, so being wrong costs a reader one scroll.
 */
export function guessPlatform(userAgent: string): Guess | null {
  return GUESSES.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
}
