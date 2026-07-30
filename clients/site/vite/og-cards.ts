// Deliberately not read from the page's message catalogs: this copy is
// fitted to the 1200x630 crop. `[…]` marks the amber words, as in lib/rich.ts.
// The base locale keeps the unsuffixed filename so links shared before the
// site was bilingual still resolve.
export const OG_CARDS = {
  en: {
    file: 'og.png',
    title: 'Your media library, [at home].',
    sub: 'One self-hosted Rust binary. Direct-play HEVC on the web, on mobile and on every television.',
  },
  fr: {
    file: 'og.fr.png',
    title: 'Votre médiathèque, [chez vous].',
    sub: 'Un seul binaire Rust, auto-hébergé. Direct-play HEVC sur le web, le mobile et toutes les télévisions.',
  },
} as const;

export type OgCardSpec = (typeof OG_CARDS)[keyof typeof OG_CARDS];
