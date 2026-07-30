import type { Plugin } from 'vite';

/**
 * Ends the process once the build has finished. Without this, `vite build`
 * sits idle for 5 minutes after the prerender: the TanStack Start
 * shell-prerender's render server leaks a handle that only Node's default
 * 300s requestTimeout releases. Exit code 0 keeps a `vite build && …` chain
 * working; a failed build never gets here.
 */
export function exitAfterBuild(): Plugin {
  return {
    name: 'kroma:exit-after-build',
    // Must sort AFTER "tanstack-start-core:post-build", which runs the
    // prerender; without `enforce` this hook fired first and skipped it.
    enforce: 'post',
    buildApp: {
      order: 'post',
      async handler() {
        setImmediate(() => process.exit(0));
      },
    },
  };
}
