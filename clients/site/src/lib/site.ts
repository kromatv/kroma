// One place for the facts the whole site repeats: the domain, the addresses, the
// subdomains. Everything here is language-INVARIANT by design - a URL, a hostname and
// an email address read the same in every locale. Translated copy, including the
// tagline and the meta description, lives in the Paraglide catalogs (messages/*.json)
// like every other word on the site.

export const site = {
  name: 'KROMA',
  domain: 'kroma.tv',
  url: 'https://kroma.tv',
  repo: 'https://github.com/maxscharwath/kroma',
  tvUrl: 'https://tv.kroma.tv',
  uiUrl: 'https://ui.kroma.tv',
  modulesUrl: 'https://modules.kroma.tv',
  packagesUrl: 'https://packages.kroma.tv',
  email: {
    support: 'support@kroma.tv',
    privacy: 'privacy@kroma.tv',
  },
} as const;
