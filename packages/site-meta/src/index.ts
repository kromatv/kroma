const url = 'https://kroma.tv';
const repo = 'https://github.com/maxscharwath/kroma';

/**
 * The facts every KROMA web property repeats. Language-invariant only:
 * translated copy stays in each site's own catalogue.
 */
export const site = {
  name: 'KROMA',
  domain: 'kroma.tv',
  url,
  repo,
  tvUrl: 'https://tv.kroma.tv',
  uiUrl: 'https://ui.kroma.tv',
  modulesUrl: 'https://modules.kroma.tv',
  packagesUrl: 'https://packages.kroma.tv',
  license: 'GPL-2.0',
  email: {
    support: 'support@kroma.tv',
    privacy: 'privacy@kroma.tv',
  },
  links: {
    download: `${url}/download`,
    blog: `${url}/blog`,
    privacy: `${url}/privacy`,
    support: `${url}/support`,
    releases: `${repo}/releases`,
    issues: `${repo}/issues`,
    license: `${repo}/blob/main/LICENSE`,
    installGuide: `${repo}/blob/main/INSTALL.md`,
    contributing: `${repo}/blob/main/CONTRIBUTING.md`,
  },
} as const;
