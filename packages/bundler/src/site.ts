import { fileURLToPath } from 'node:url';
import { messageSubset } from '@kroma/bundler/message-subset';
import { RNW_DEFINE, RNW_SSR_NO_EXTERNAL, webResolve } from '@kroma/bundler/rnw';
import { kromaUI } from '@kroma/ui/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import type { Plugin, UserConfig } from 'vite';

const WORKERD_ONLY = 'cloudflare:workers';

// That module exists only inside workerd. `vite dev` resolves it like any other
// import, fails the transform, and drops an error overlay over the page which
// swallows every click - the app looks dead rather than broken. Standing in a
// module that throws puts the runtime on the same fallback path it already takes
// off workerd, so dev keeps reading process.env. `apply: 'serve'` leaves the
// deployed worker with the real builtin.
const workerdBuiltins = (): Plugin => ({
  name: 'kroma:workerd-builtins-dev',
  apply: 'serve',
  resolveId: (id) => (id === WORKERD_ONLY ? `\0${WORKERD_ONLY}` : undefined),
  load: (id) =>
    id === `\0${WORKERD_ONLY}`
      ? `throw new Error(${JSON.stringify(`${WORKERD_ONLY} is unavailable outside workerd`)})`
      : undefined,
});

export interface KromaSiteOptions {
  alias?: Record<string, string>;
  plugins?: Plugin[];
  prerender?: boolean;
  appMessages?: boolean;
}

/**
 * The Vite config every KROMA web property shares: the design system, TanStack
 * Start and the react-native-web resolution the kit needs to render on a
 * server. `appMessages` opts out of the message subset, for a site that builds
 * a catalog key at runtime.
 *
 *   export default kromaSite(import.meta.url)
 */
export function kromaSite(siteUrl: string, options: KromaSiteOptions = {}): UserConfig {
  const root = fileURLToPath(new URL('.', siteUrl));
  return {
    plugins: [
      ...(options.appMessages ? [] : [messageSubset({ roots: [`${root}src`] })]),
      kromaUI(),
      tanstackStart(options.prerender ? { prerender: { enabled: true, crawlLinks: true } } : {}),
      workerdBuiltins(),
      react(),
      ...(options.plugins ?? []),
    ],
    define: RNW_DEFINE,
    resolve: webResolve({ '#site': `${root}src`, ...options.alias }),
    // The kit ships raw TypeScript, and the aliases above land two transitive
    // deps on ESM builds Node cannot resolve on its own.
    ssr: { noExternal: ['@kroma/ui', '@kroma/core', ...RNW_SSR_NO_EXTERNAL] },
  };
}
