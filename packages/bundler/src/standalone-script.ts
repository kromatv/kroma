// Bundling for the scripts that live OUTSIDE a client's module graph: a
// service worker the browser fetches by URL, a Tizen background service the
// platform launches from a path in config.xml. Nothing imports them, so Vite
// never sees them and they'd otherwise ship uncompiled and untypechecked.

import { type BuildOptions, build } from 'esbuild';
import type { Plugin } from 'vite';

export interface StandaloneScriptOptions {
  entry: string;
  outfile: string;
  esbuild?: BuildOptions;
}

/**
 * The options the plugin bundles with, exported so a test can compile the same
 * artefact the build ships rather than a second guess at it.
 */
export function standaloneOptions({ entry, outfile, esbuild = {} }: StandaloneScriptOptions) {
  return {
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'iife',
    minify: true,
    // Nothing here is served with a sourcemap, and one would be the only file in
    // the output handing out its own source.
    sourcemap: false,
    legalComments: 'none',
    ...esbuild,
  } satisfies BuildOptions;
}

/**
 * Emit a script that nothing imports, as part of the normal build.
 *
 * The point is that there is no separate command to forget: `dev` and `build`
 * both produce it, and in dev an edit to the source rebuilds it rather than
 * needing a server restart. It writes into `public/`, which the dev server
 * serves and the build copies, so the output is a build artefact: git-ignore
 * it, and edit the source.
 */
export function standaloneScript(options: StandaloneScriptOptions): Plugin {
  const run = () => build(standaloneOptions(options));

  return {
    name: `kroma:standalone-script:${options.outfile.split(/[/\\]/).pop()}`,
    // These scripts are client artefacts, and `buildStart` fires once per Vite
    // environment: without this the worker is bundled again for the SSR pass.
    applyToEnvironment: (env) => env.name === 'client',
    async buildStart() {
      await run();
    },
    configureServer(server) {
      // An entry inside the Vite root is watched already; one outside it is not,
      // and this plugin does not get to assume which it was handed.
      server.watcher.add(options.entry);
      server.watcher.on('change', (file) => {
        if (file !== options.entry) return;
        run().catch((err: unknown) => server.config.logger.error(String(err)));
      });
    },
  };
}
