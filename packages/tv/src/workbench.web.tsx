// The workbench config for the browser TV shells (`?workbench` on Tizen, webOS,
// Android TV's WebView, the desktop shell).
//
// `searchParamsRouter` rather than the workbench default: Tizen and webOS load
// index.html off the filesystem with no server to fall back to it, so a reload of
// `/story/button` is a 404. `workbench.tsx` beside this is the Metro half, because
// Metro cannot transform `import.meta.glob`.

import { KROMA_WORKBENCH } from '@kroma/ui/workbench-config';
import { defineWorkbench, discoverVite, type GlobHost, searchParamsRouter } from '@kroma/workbench';

// Written out in full and cast in place: Vite finds `import.meta.glob(...)` by
// matching the literal text, so hoisting the host or options into a local
// stops it being a glob and throws at runtime.
//
// No prop docs: those come from a Vite plugin (`propDocs` in clients/tv-build)
// that `shell.ts` does not load, so the Props tab is empty here.
const STORIES = discoverVite(
  (import.meta as unknown as GlobHost).glob('#ui/**/*.{stories.tsx,demo.tsx,docs.mdx}', {
    eager: true,
  }),
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
