// Which build the kit SITE is — the Vite half of the pair.
//
// `__KROMA_BUILD__` is replaced with the literal object at build time (see
// vite.config.ts), so none of the collector ships. The Metro half reads Expo's
// `extra` instead; see buildInfo.ts, which this file stands in for on the web.

import type { BuildInfo } from './buildInfo.types';

declare const __KROMA_BUILD__: BuildInfo | undefined;

/** Read through `typeof` so a bundle built without the define (a `vite preview`
 * of a dist built elsewhere, a test harness) degrades to an empty stamp instead
 * of throwing on an undeclared name. */
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
