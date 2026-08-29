import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RNW_DEFINE,
  RNW_OPTIMIZE_INCLUDE,
  RNW_SSR_NO_EXTERNAL,
  webResolve,
} from '@kroma/bundler/rnw';
import launchEditor from 'launch-editor';
import type { Plugin, ViteDevServer } from 'vite';
import { type Editor, installedEditors, launcherOf, resolveFile, within } from './editors.ts';
import { forgetMaps, type Served, sourceOf } from './where.ts';

/**
 * Where the tools go in for each engine, and what they inspect it through.
 *
 * The anchor is a module the app always loads when it translates through that
 * engine - its own front door - so the tools arrive with the first message and
 * a shell configures nothing.
 */
const ADAPTERS = {
  kroma: {
    anchor: /[\\/]i18n[\\/]src[\\/]react[\\/]provider\.tsx$/,
    engine: '@kroma/i18n-devtools/kroma',
    wire: null,
  },
  paraglide: {
    anchor: /[\\/]paraglide[\\/]messages\.js$/,
    engine: '@kroma/i18n-devtools/paraglide',
    wire: throughParaglide,
  },
} as const;

// Paraglide compiles each message to a standalone function, so nothing sees a
// message unless the app calls through something the adapter owns. `m` is the
// one handle it has: swapping the namespace re-export for the wrapped object
// puts every `m.hello()` through the inspector, and a named import still
// resolves past it.
const NAMESPACE = /export \* as m from '([^']+)';?/;

function throughParaglide(code: string, engine: string): string {
  const found = NAMESPACE.exec(code);
  if (!found) return code;
  return code.replace(
    found[0],
    [
      `import * as __kromaI18nRuntime from './runtime.js';`,
      `import * as __kromaI18nMessages from '${found[1]}';`,
      `import { paraglide as __kromaI18nParaglide } from '${engine}';`,
      'export const m = __kromaI18nParaglide({',
      '  runtime: __kromaI18nRuntime,',
      '  messages: __kromaI18nMessages,',
      '}).messages;',
    ].join('\n'),
  );
}

/** Which engine an app translates through: the one it depends on. */
export type Adapter = keyof typeof ADAPTERS;

const SPEAKS: Record<string, Adapter> = {
  '@inlang/paraglide-js': 'paraglide',
  '@kroma/i18n': 'kroma',
};

function speaks(from: string): Adapter {
  try {
    const manifest = JSON.parse(readFileSync(join(from, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const named = { ...manifest.dependencies, ...manifest.devDependencies };
    for (const [dependency, adapter] of Object.entries(SPEAKS)) {
      if (named[dependency]) return adapter;
    }
  } catch {}
  return 'kroma';
}

// The dev overlays that cannot carry the opt-out attribute themselves, because
// a third party renders them. Everything else says what it is; this is the
// plugin's own default, and the one place that has any business knowing which
// dev tooling exists.
const OVERLAYS = ['.tsqd-parent-container'];

function injected(ignore: readonly string[], engine: string): string {
  return `
import { mount as __kromaI18nDevtools } from '@kroma/i18n-devtools';
import { engine as __kromaI18nEngine } from '${engine}';
const __kromaI18nDevtoolsStop = __kromaI18nDevtools({
  ...${JSON.stringify({ ignore })},
  hot: import.meta.hot,
  engine: __kromaI18nEngine,
});
if (import.meta.hot) import.meta.hot.dispose(__kromaI18nDevtoolsStop);
`;
}

interface AliasEntry {
  find: string | RegExp;
  replacement: string;
}

const PANEL = '@kroma/i18n-devtools';
const KIT = '@kroma/ui';
const POSITION = /:\d+(?::\d+)?$/;

// The injection lands in @kroma/i18n, which does not depend on the panel: only
// a shell does. So the bare specifier is resolved here, against the shell that
// loaded this plugin, and handed to Vite as an alias.
function panelEntry(): string | null {
  for (const from of [`${process.cwd()}/`, import.meta.url]) {
    try {
      return createRequire(from).resolve(PANEL);
    } catch {}
  }
  const sibling = fileURLToPath(new URL('../src/index.ts', import.meta.url));
  return existsSync(sibling) ? sibling : null;
}

/** The i18n dev tools, for a shell's `plugins`. Dev server only. */
function open(file: string, editor: string, server: ViteDevServer): boolean {
  const at = resolveFile(file, server.config.root);
  if (!at || !within(at.replace(POSITION, ''), server.config.server.fs.allow)) {
    server.config.logger.warn(`[i18n] refused to open ${file}`);
    return false;
  }
  launchEditor(at, launcherOf(editor) ?? undefined, (name, error) => {
    server.config.logger.warn(`[i18n] could not open ${name}: ${error ?? 'no editor found'}`);
  });
  return true;
}

// An adapter ships beside the panel, so it is found beside the panel - and a
// missing one is an engine these tools cannot inspect, which is a reason to
// stay out of the way rather than to break the app that loaded them.
function adapterFor(entry: string | null, speaking: Adapter): string | null {
  if (!entry) return null;
  const at = entry.replace(/index\.ts$/, `engine/${speaking}/${speaking}.ts`);
  return existsSync(at) ? at : null;
}

export interface DevtoolsOptions {
  /** Also leave these out of the overlay, on top of anything wearing
   *  `data-kroma-devtool`: an overlay a third party renders cannot be asked to
   *  wear it. */
  ignore?: readonly string[];
  /** The engine to inspect. Read off what the app depends on, and named only
   *  by one that depends on two. */
  adapter?: Adapter;
}

export function kromaI18nDevtools({ ignore = OVERLAYS, adapter }: DevtoolsOptions = {}): Plugin {
  const speaking = adapter ?? speaks(process.cwd());
  const { anchor, engine, wire } = ADAPTERS[speaking];
  const entry = panelEntry();
  const adapterEntry = adapterFor(entry, speaking);
  let editors: Editor[] | null = null;
  // The module the tools went into, remembered so the panel can ask for it to
  // be re-run: it is the one every message is rendered through.
  let anchored: string | null = null;
  return {
    name: 'kroma-i18n-devtools',
    apply: 'serve',
    enforce: 'pre',
    // The panel is @kroma/ui, which is authored against React Native, so it
    // needs the web pipeline whatever the host is - a site that renders no
    // kit component has no reason to carry it. `apply: 'serve'` keeps all of
    // it out of the build.
    config() {
      if (!entry || !adapterEntry) return {};
      const web = webResolve();
      const aliased = web.alias as AliasEntry[];
      return {
        define: RNW_DEFINE,
        resolve: {
          ...web,
          alias: [
            { find: engine, replacement: adapterEntry },
            { find: PANEL, replacement: entry },
            ...aliased,
          ],
        },
        optimizeDeps: { include: RNW_OPTIMIZE_INCLUDE, exclude: [PANEL, KIT] },
        ssr: { noExternal: [...RNW_SSR_NO_EXTERNAL, KIT, PANEL] },
      };
    },
    configureServer(server) {
      const { hot } = server.environments.client;
      hot.on('kroma:i18n:editors', (ask: { at: number }, client) => {
        editors ??= installedEditors();
        client.send('kroma:i18n:editors', { at: ask.at, editors });
      });
      hot.on('kroma:i18n:where', (ask: Served & { at: number }, client) => {
        void sourceOf(ask, server).then((at) =>
          client.send('kroma:i18n:where', { at: ask.at, line: at?.line ?? null }),
        );
      });
      hot.on('kroma:i18n:open', (ask: { at: number; file: string; editor?: string }, client) => {
        const opened = open(ask.file, ask.editor ?? '', server);
        client.send('kroma:i18n:open', { at: ask.at, opened });
      });
      // Only the importers that accept their own updates, and never the module
      // itself. Re-running the module the messages come from would rebuild the
      // object the app renders through while the app may be hydrating; and an
      // importer that does NOT accept is one React Refresh cannot re-render in
      // place, so re-running it throws its component away and builds a new one
      // - which is a flash on screen and lost focus, for a switch that changed
      // no code. What is left re-renders with its DOM intact.
      hot.on('kroma:i18n:refresh', () => {
        const { client } = server.environments;
        const module = anchored === null ? undefined : client.moduleGraph.getModuleById(anchored);
        const at = Date.now();
        const updates = [];
        for (const importer of module?.importers ?? []) {
          if (!importer.isSelfAccepting || !importer.url) continue;
          client.moduleGraph.invalidateModule(importer);
          updates.push({
            type: 'js-update' as const,
            path: importer.url,
            acceptedPath: importer.url,
            timestamp: at,
          });
        }
        // One message, not one per module: a reload each would be its own round
        // trip, its own render and its own paint, and the page would be seen
        // rebuilding itself a piece at a time. This is the shape Vite sends
        // when one file reaches many boundaries.
        if (updates.length > 0) hot.send({ type: 'update', updates });
      });
      server.watcher.on('change', forgetMaps);
    },

    transform(code, id, options) {
      if (entry === null || adapterEntry === null || options?.ssr) return null;
      const query = id.indexOf('?');
      const file = query === -1 ? id : id.slice(0, query);
      if (!anchor.test(file)) return null;
      // Without the query a dev server appends, so the graph can be asked for
      // it by the same name whichever version was served.
      anchored = file;
      const wired = wire ? wire(code, engine) : code;
      return { code: wired + injected(ignore, engine), map: null };
    },
  };
}
