// The workbench config for the browser TV shells (`?workbench` on Tizen, webOS,
// Android TV's WebView, the desktop shell).
//
// The same three-way split the kit site uses - @kroma/workbench is the tool,
// @kroma/ui provides the stories and the KROMA-shaped config, this file is the
// bundler half - and it differs from the kit's in one line: the ROUTER. Tizen and
// webOS load index.html off the filesystem, with no server to fall back to it, so a
// reload of `/story/button` is a 404 and the workbench's default path routing cannot
// work. Hence `searchParamsRouter`, which is also what keeps `?workbench` - the flag
// these shells use to decide to show the workbench at all - working alongside it.
//
// It exists as a second config rather than an import of the kit's because
// `clients/kit` is an application, not a package: a glob cannot be shared across
// bundler entry points, since `import.meta.glob` resolves relative to the file that
// writes it.
//
// This is the WEB half. `workbench.tsx` beside it is the Metro one, because
// @kroma/tv is in the native app's graph too and Metro cannot transform
// `import.meta.glob` - the kit's usual `.web` split, for the usual reason.

import { KROMA_WORKBENCH } from '@kroma/ui/workbench-config';
import { defineWorkbench, discoverVite, type GlobHost, searchParamsRouter } from '@kroma/workbench';

// Two globs: one for the stories and demos, one for the DEMOS as text (which is
// what gives a demo its code panel). `#ui` is an alias and a glob pattern resolves
// them, so this file does not count `../` to another package. Both are written out
// in full, cast in place: the call is found by matching the text
// `import.meta.glob(`, so a local for the host or for the options silently stops
// being a glob and throws at runtime instead.
//
// No prop docs here, and that is deliberate rather than an omission: they are read
// by a Vite PLUGIN over the whole design system (`propDocs` in clients/tv-build),
// and these shells are built by `shell.ts`, which does not load it. The Props tab
// is empty on a television, exactly as it is under Metro.
const STORIES = discoverVite(
  (import.meta as unknown as GlobHost).glob('#ui/**/*.{stories,demo}.tsx', { eager: true }),
  (import.meta as unknown as GlobHost).glob('#ui/**/*.demo.tsx', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
);

const Workbench = defineWorkbench({
  ...KROMA_WORKBENCH,
  stories: STORIES,
  router: searchParamsRouter(),
});

export { STORIES, Workbench };
