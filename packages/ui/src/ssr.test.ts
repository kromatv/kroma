import { StyleSheet } from 'react-native';
import { describe, expect, it } from 'vitest';
import { THEME_COOKIE } from './core/theme-mode';
import { withKitStyles, withTheme } from './ssr';

const live = () =>
  (StyleSheet as unknown as { getSheet(): { textContent: string } }).getSheet().textContent;

const page = (body: string, init?: ResponseInit) =>
  new Response(body, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init,
  });

const get = (cookie?: string) =>
  new Request('https://packages.kroma.tv/browse', {
    headers: cookie ? { cookie } : undefined,
  });

const inlined = (html: string) =>
  /<style id="react-native-stylesheet">([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';

describe('withTheme', () => {
  const served = (body = '<html lang="fr"><head></head><body>y</body></html>') =>
    withTheme(() => page(body));

  it("stamps the visitor's stored ground on the document the server sends", async () => {
    const html = await (await served()(get(`${THEME_COOKIE}=light`))).text();

    expect(html).toContain('<html data-theme="light" lang="fr">');
  });

  it('leaves system unstamped, so prefers-color-scheme answers it live', async () => {
    const html = await (await served()(get(`${THEME_COOKIE}=system`))).text();

    expect(html).toContain('<html lang="fr">');
    expect(html).not.toContain('data-theme');
  });

  it('reads a visitor with no cookie, and one with a value it does not know, as system', async () => {
    expect(await (await served()(get())).text()).not.toContain('data-theme');
    expect(await (await served()(get(`${THEME_COOKIE}=ocean`))).text()).not.toContain('data-theme');
  });

  it('finds the choice among the other cookies a visitor carries', async () => {
    const html = await (
      await served()(get(`kroma.session=abc; ${THEME_COOKIE}=dark; consent=1`))
    ).text();

    expect(html).toContain('data-theme="dark"');
  });

  it('varies on cookie, or a shared cache serves one visitor ground to the next', async () => {
    const response = await served()(get(`${THEME_COOKIE}=light`));

    expect(response.headers.get('vary')).toContain('cookie');
    expect(response.headers.get('content-length')).toBeNull();
  });

  it('keeps the status and the headers the handler set', async () => {
    const handler = withTheme(() =>
      page('<html><head></head><body>gone</body></html>', {
        status: 404,
        statusText: 'Not Found',
        headers: { 'content-type': 'text/html', 'cache-control': 'max-age=60' },
      }),
    );
    const response = await handler(get(`${THEME_COOKIE}=dark`));

    expect(response.status).toBe(404);
    expect(response.statusText).toBe('Not Found');
    expect(response.headers.get('cache-control')).toBe('max-age=60');
  });

  it('leaves a response that is not a document alone', async () => {
    const json = new Response('{"packages":[]}', {
      headers: { 'content-type': 'application/json' },
    });
    const handler = withTheme(() => json);

    expect(await handler(get(`${THEME_COOKIE}=light`))).toBe(json);
  });
});

describe('withKitStyles', () => {
  it('inlines the compiled stylesheet before the head closes', async () => {
    const served = withKitStyles(() => page('<html><head><title>x</title></head><body>y</body>'));
    const html = await (await served(get())).text();

    expect(html).toContain('<style id="react-native-stylesheet">');
    expect(html.indexOf('<style')).toBeLessThan(html.indexOf('</head>'));
    expect(html).toContain('<body>y</body>');
  });

  it('hands the client every rule, group markers and all', async () => {
    const served = withKitStyles(() => page('<html><head></head><body>y</body>'));
    const html = await (await served(get())).text();

    expect(inlined(html)).toBe(live());
    expect(inlined(html)).toContain('[stylesheet-group=');
  });

  it('leaves a response that is not a document alone', async () => {
    const json = new Response('{"packages":[]}', {
      headers: { 'content-type': 'application/json' },
    });
    const served = withKitStyles(() => json);

    expect(await served(get())).toBe(json);
  });

  it('keeps the status and the headers the handler set', async () => {
    const served = withKitStyles(() =>
      page('<html><head></head><body>gone</body>', {
        status: 404,
        statusText: 'Not Found',
        headers: { 'content-type': 'text/html', 'cache-control': 'max-age=60' },
      }),
    );
    const response = await served(get());

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('max-age=60');
    expect(response.headers.get('content-length')).toBeNull();
  });
});
