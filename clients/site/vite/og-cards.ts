/**
 * The card's wording, per locale.
 *
 * Deliberately NOT read from the page's message catalogs: this copy is fitted to a
 * 1200x630 crop where the full page tagline would wrap to four lines, and the line
 * break is authored rather than negotiated by the layout engine. `[…]` marks the
 * amber words, the same marker convention the site's messages use (lib/rich.ts).
 *
 * The base locale keeps the unsuffixed filename so a link shared before the site was
 * bilingual still resolves to a real image. `lib/seo.ts` maps a locale to the file.
 *
 * Its own module because both halves of the generator read it: the plugin needs the
 * filenames to emit and to serve, the renderer needs the copy.
 */
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
