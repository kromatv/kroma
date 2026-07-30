// The story registry, Metro's half — the native mirror of `stories.web.ts`,
// which uses `import.meta.glob`. Metro cannot hand a module its own text, so
// there is no `?raw` half here and a demo renders without its code panel.

import { discoverMetro } from '@kroma/workbench';

// Metro's build-time directory require: it exists in the bundler, not in the
// runtime, so it is declared locally rather than globally.
declare const require: {
  context(
    directory: string,
    useSubdirectories: boolean,
    regExp: RegExp,
  ): { keys(): string[]; <T>(id: string): T };
};

export const STORIES = discoverMetro(
  require.context('../../../packages/ui/src', true, /\.(stories|demo)\.tsx$/),
);
