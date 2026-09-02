import { fileURLToPath } from 'node:url';
import { kroma } from '@kroma/bundler';
import { messageSubset } from '@kroma/bundler/message-subset';
import type { Plugin, UserConfig } from 'vite';

const WORKERD_ONLY = 'cloudflare:workers';
const OUTSIDE_WORKERD = `${WORKERD_ONLY} is unavailable outside workerd`;

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
    id === `\0${WORKERD_ONLY}` ? `throw new Error(${JSON.stringify(OUTSIDE_WORKERD)})` : undefined,
});

export interface KromaSiteOptions {
  alias?: Record<string, string>;
  plugins?: Plugin[];
  prerender?: boolean;
  appMessages?: boolean;
}

/**
 * The Vite config every KROMA web property shares: `kroma()` with TanStack
 * Start, rooted at the config file. `appMessages` opts out of the message
 * subset, for a site that builds a catalog key at runtime.
 *
 *   export default kromaSite(import.meta.url)
 */
export function kromaSite(siteUrl: string, options: KromaSiteOptions = {}): UserConfig {
  const root = fileURLToPath(new URL('.', siteUrl));
  return {
    root,
    plugins: [
      ...(options.appMessages ? [] : [messageSubset({ roots: [`${root}src`] })]),
      kroma({
        alias: { '#site': './src', ...options.alias },
        start: options.prerender ? { prerender: { enabled: true, crawlLinks: true } } : {},
      }),
      workerdBuiltins(),
      ...(options.plugins ?? []),
    ],
  };
}
