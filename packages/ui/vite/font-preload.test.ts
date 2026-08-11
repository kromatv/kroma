import { existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { kromaFontPreload } from './font-preload';
import { fontsCss } from './tokens';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));

const HTML = `${REPO}clients/tizen/index.html`;

const inject = (ctx: { filename: string; server?: { config: { root: string; base?: string } } }) =>
  kromaFontPreload().transformIndexHtml.handler('<html><head></head></html>', ctx);

const built = () => inject({ filename: HTML });

const srcUrls = () =>
  [...fontsCss().matchAll(/src: url\("([^"]+)"\)/g)].map(([, url]) => url ?? '');

describe('kromaFontPreload', () => {
  it('preloads a face for each self-hosted family, and only the latin subset', () => {
    const hrefs = built().map((tag) => tag.attrs.href ?? '');

    expect(hrefs.map((href) => basename(href))).toEqual([
      'bricolage-grotesque-latin.woff2',
      'hanken-grotesk-latin.woff2',
    ]);
    expect(hrefs.some((href) => href.includes('latin-ext'))).toBe(false);
  });

  it('names the very files the @font-face rules ask for', () => {
    const declared = srcUrls();

    for (const tag of built()) {
      const href = tag.attrs.href ?? '';
      expect(isAbsolute(href)).toBe(false);
      const file = resolve(dirname(HTML), href);
      expect(existsSync(file)).toBe(true);
      expect(declared).toContain(file);
    }
  });

  it('declares the fetch a font actually makes, or the browser makes it twice', () => {
    for (const tag of built()) {
      expect(tag.tag).toBe('link');
      expect(tag.injectTo).toBe('head-prepend');
      expect(tag.attrs.rel).toBe('preload');
      expect(tag.attrs.as).toBe('font');
      expect(tag.attrs.type).toBe('font/woff2');
      expect(tag.attrs.crossorigin).toBe('anonymous');
    }
  });

  it('hands a build a path Vite resolves against the html, so hashing still applies', () => {
    for (const tag of built()) expect(tag.attrs.href).toMatch(/^\.\.\//);
  });

  it('hands the dev server the /@fs URL its own stylesheet resolves to', () => {
    const hrefs = inject({
      filename: HTML,
      server: { config: { root: `${REPO}clients/tizen` } },
    }).map((tag) => tag.attrs.href ?? '');

    expect(hrefs).toEqual(
      srcUrls()
        .filter((url) => url.endsWith('-latin.woff2'))
        .map((url) => `/@fs${url}`),
    );
  });

  it('serves a font inside the root as a plain root-relative URL, under the app base', () => {
    const [href] = inject({
      filename: HTML,
      server: { config: { root: REPO.replace(/\/$/, ''), base: '/app/' } },
    }).map((tag) => tag.attrs.href ?? '');

    expect(href).toBe('/app/packages/ui/src/assets/fonts/bricolage-grotesque-latin.woff2');
  });
});
