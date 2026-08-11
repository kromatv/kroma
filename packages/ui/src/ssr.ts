import { StyleSheet } from 'react-native';
import { readMode } from './core/theme-mode';

type Fetch = (request: Request) => Response | Promise<Response>;

// react-native-web only, and it ships no TypeScript types.
type WebStyleSheet = { getSheet(): { id: string; textContent: string } };

/**
 * Stamps the visitor's stored ground on `<html>` before the document leaves the
 * server, so a page that will be light never paints dark first.
 *
 * `system` is left unstamped on purpose: the token sheet resolves it through
 * `prefers-color-scheme`, live and without a line of script.
 */
export function withTheme(handler: Fetch): Fetch {
  return async (request: Request) => {
    const response = await handler(request);
    if (!response.headers.get('content-type')?.includes('text/html')) return response;

    const mode = readMode(request.headers.get('cookie') ?? '');
    const html = await response.text();
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.append('vary', 'cookie');
    return new Response(
      mode === 'system' ? html : html.replace('<html', `<html data-theme="${mode}"`),
      { status: response.status, statusText: response.statusText, headers },
    );
  };
}

/**
 * Puts the kit's compiled stylesheet in the document the server sends, since
 * react-native-web otherwise only injects its atomic CSS on hydration.
 *
 * The response is buffered rather than streamed: a recipe compiles on its first
 * render, so the rules a page needs exist only after `</head>` would have been
 * flushed. The element carries the WHOLE sheet under the id react-native-web
 * looks for, or the client adopts an empty one and mints every rule again.
 */
export function withKitStyles(handler: Fetch): Fetch {
  return async (request: Request) => {
    const response = await handler(request);
    if (!response.headers.get('content-type')?.includes('text/html')) return response;

    const html = await response.text();
    const sheet = (StyleSheet as unknown as WebStyleSheet).getSheet();
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(
      html.replace('</head>', `<style id="${sheet.id}">${sheet.textContent}</style></head>`),
      { status: response.status, statusText: response.statusText, headers },
    );
  };
}
