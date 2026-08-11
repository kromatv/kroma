import { describe, expect, it } from 'vitest';
import { site } from './index';

const properties = [site.url, site.tvUrl, site.uiUrl, site.modulesUrl, site.packagesUrl];
const urls = [...properties, site.repo, ...Object.values(site.links)];

describe('site', () => {
  it('serves every address over https', () => {
    for (const url of urls) {
      expect(new URL(url).protocol).toBe('https:');
    }
  });

  it('keeps every subdomain under the one domain the site names', () => {
    for (const url of properties) {
      expect(new URL(url).hostname.split('.').slice(-2).join('.')).toBe(site.domain);
    }
  });

  it('routes every mailbox to that same domain', () => {
    for (const address of Object.values(site.email)) {
      expect(address.split('@').at(-1)).toBe(site.domain);
    }
  });

  it('points every derived link at the site or at the repository', () => {
    for (const link of Object.values(site.links)) {
      expect(link.startsWith(`${site.url}/`) || link.startsWith(`${site.repo}/`)).toBe(true);
    }
  });
});
