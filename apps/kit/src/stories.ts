// The Metro mirror of `stories.web.ts`. Metro cannot hand a module its own
// text, so there is no `?raw` half here and a demo renders without its code
// panel.

import { discoverMetro } from '@kroma/workbench';

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
