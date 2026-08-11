// `__KROMA_BUILD__` is replaced by vite.config.ts. The Metro half of the pair
// is buildInfo.ts.

import type { BuildInfo } from './buildInfo.types';

declare const __KROMA_BUILD__: BuildInfo | undefined;

// Read through `typeof`: a bundle built without the define would throw on an
// undeclared name.
const DEFINED =
  typeof __KROMA_BUILD__ === 'object' && __KROMA_BUILD__ ? __KROMA_BUILD__ : undefined;

export const BUILD: BuildInfo = DEFINED ?? {
  version: '',
  commit: null,
  branch: null,
  dirty: false,
  buildDate: null,
  repository: null,
};
