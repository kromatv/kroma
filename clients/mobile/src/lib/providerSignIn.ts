import type { KromaClient } from '@kromatv/client';
import { type Auth, createAuth, type FlowBrowser, memoryFlowStore } from '@kromatv/core';
import * as WebBrowser from 'expo-web-browser';

/** The address a provider flow comes back on. `kroma` is the scheme this app
 * registers (`expo.scheme`), and the server redirects here for a flow begun
 * with `returnTo: 'app'`. */
export const APP_RETURN = 'kroma://sso';

const pending = memoryFlowStore();
const known = new Map<string, Auth>();

/** How this app takes a person to a provider: the system's authentication
 * browser, which resolves with the address it was closed on. See
 * `docs/reference/sign-in-providers.md` for what Expo documents about it. */
export function appBrowser(serverUrl: string): FlowBrowser {
  return {
    from: { returnTo: 'app', origin: serverUrl },
    open: async (url) => {
      const result = await WebBrowser.openAuthSessionAsync(url, APP_RETURN);
      return result.type === 'success' ? result.url : null;
    },
  };
}

/** The auth object for the server at `serverUrl`. One per server and one
 * pending flow for the app, so the sign-in screen and the route a return link
 * opens resume the same flow and share its answer. */
export function authFor(serverUrl: string, client: KromaClient): Auth {
  const held = known.get(serverUrl);
  if (held) return held;
  const made = createAuth({ client, browser: appBrowser(serverUrl), store: pending });
  known.set(serverUrl, made);
  return made;
}
