import type { Plugin } from 'vite';

/**
 * End the process once the build has finished.
 *
 * `vite build` used to sit idle for exactly 5 minutes after the prerender: the
 * TanStack Start shell-prerender's render server leaks a handle that only Node's
 * default 300s http requestTimeout releases. Everything is on disk once the
 * start plugin's own buildApp hook (build + prerender) resolves, so this hook —
 * which vite runs sequentially AFTER it — can end the process. Exit code 0 keeps
 * a `vite build && …` chain working; a failed build never gets here.
 */
export function exitAfterBuild(): Plugin {
  return {
    name: 'kroma:exit-after-build',
    // Must sort AFTER "tanstack-start-core:post-build" (enforce post + hook
    // order post), which is what runs the prerender; without `enforce` this hook
    // fired first and the build skipped the shell prerender entirely.
    enforce: 'post',
    buildApp: {
      order: 'post',
      async handler() {
        setImmediate(() => process.exit(0));
      },
    },
  };
}
