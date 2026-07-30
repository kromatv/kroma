// Bundling for the scripts that live OUTSIDE a client's module graph.
//
// Every client has one or two: a service worker the browser fetches by URL, a
// Tizen background service the platform launches from a path in config.xml.
// Nothing imports them, so Vite never sees them, so for a long time they were
// hand-written straight into `public/` and copied verbatim — which made them the
// only files in the repo no compiler read. The Tizen preview service shipped
// `?.` to a Chromium 76 that treats it as a SyntaxError and killed the Smart Hub
// carousel silently; turning the typechecker on the web service worker, a file
// of the same size, found four more holes.

import { type BuildOptions, build } from 'esbuild';
import type { Plugin } from 'vite';

export interface StandaloneScriptOptions {
  /** The entry to bundle. Absolute, or relative to the Vite root. */
  entry: string;
  /** Where to write the bundle. Absolute, or relative to the Vite root. */
  outfile: string;
  /**
   * esbuild overrides. The defaults produce one self-contained, minified IIFE;
   * a script shipping to an engine older than the browser floor wants its own
   * `target`, and the Tizen service wants CJS on a `neutral` platform.
   */
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
 * serves and the build copies — so the output is a build artefact: git-ignore
 * it, and edit the source.
 */
export function standaloneScript(options: StandaloneScriptOptions): Plugin {
  const run = () => build(standaloneOptions(options));

  return {
    name: `kroma:standalone-script:${options.outfile.split(/[/\\]/).pop()}`,
    // These scripts are client artefacts, and `buildStart` fires once per Vite
    // environment — without this the worker is bundled again for the SSR pass.
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
