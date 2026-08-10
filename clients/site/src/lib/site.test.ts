import { describe, expect, it } from 'vitest';
import { site } from './site';

const urls = [site.url, site.repo, site.tvUrl, site.uiUrl, site.modulesUrl, site.packagesUrl];

describe('site', () => {
  it('serves every address over https', () => {
    for (const url of urls) {
      expect(new URL(url).protocol).toBe('https:');
    }
  });

  it('keeps every subdomain under the one domain the site names', () => {
    for (const url of [site.url, site.tvUrl, site.uiUrl, site.modulesUrl, site.packagesUrl]) {
      expect(new URL(url).hostname.split('.').slice(-2).join('.')).toBe(site.domain);
    }
  });

  it('routes every mailbox to that same domain', () => {
    for (const address of Object.values(site.email)) {
      expect(address.split('@').at(-1)).toBe(site.domain);
    }
  });
});
