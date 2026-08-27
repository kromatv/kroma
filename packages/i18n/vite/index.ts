import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const PROVIDER = /[\\/]i18n[\\/]src[\\/]react[\\/]provider\.tsx$/;

const INJECTED = `
import { mount as __kromaI18nDevtools } from '@kroma/i18n-devtools';
const __kromaI18nDevtoolsStop = __kromaI18nDevtools();
if (import.meta.hot) import.meta.hot.dispose(__kromaI18nDevtoolsStop);
`;

const PANEL = '@kroma/i18n-devtools';

// The injection lands in @kroma/i18n, which does not depend on the panel: only
// a shell does. So the bare specifier is resolved here, against the shell that
// loaded this plugin, and handed to Vite as an alias.
function panelEntry(): string | null {
  for (const from of [`${process.cwd()}/`, import.meta.url]) {
    try {
      return createRequire(from).resolve(PANEL);
    } catch {}
  }
  const sibling = fileURLToPath(new URL('../../i18n-devtools/src/index.ts', import.meta.url));
  return existsSync(sibling) ? sibling : null;
}

/** The i18n dev tools, for a shell's `plugins`. Dev server only. */
export function kromaI18nDevtools(): Plugin {
  const entry = panelEntry();
  return {
    name: 'kroma-i18n-devtools',
    apply: 'serve',
    enforce: 'pre',
    config() {
      return entry ? { resolve: { alias: { [PANEL]: entry } } } : {};
    },
    transform(code, id, options) {
      if (entry === null || options?.ssr) return null;
      const query = id.indexOf('?');
      if (!PROVIDER.test(query === -1 ? id : id.slice(0, query))) return null;
      return { code: code + INJECTED, map: null };
    },
  };
}
