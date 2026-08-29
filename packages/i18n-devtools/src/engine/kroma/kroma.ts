import {
  activeAppLocales,
  hasToken,
  installKeyInspector,
  installLocaleOverride,
  onOverridesChange,
  tokensIn,
} from '@kroma/i18n';
import type { Engine } from '../engine';

const NOTHING: readonly string[] = [];

/** KROMA's own engine, for the tools to inspect. Everything it reports comes
 *  from the engine itself: a provider announces what it can render, so no app
 *  table is read and this adapter depends on nothing but its peer. */
export const engine: Engine = {
  name: 'KROMA',
  locales: () => activeAppLocales()?.codes ?? NOTHING,
  activeLocale: () => activeAppLocales()?.resolved ?? '',
  inspect: (inspect) =>
    installKeyInspector(
      inspect &&
        ((rendered) =>
          inspect({ ...rendered, holes: hasToken(rendered.text) ? tokensIn(rendered.text) : [] })),
    ),
  overrideLocale: installLocaleOverride,
  subscribe: onOverridesChange,
};
