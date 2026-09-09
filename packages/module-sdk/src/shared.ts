// The contract between a host and a runtime-loaded module bundle.
//
// A module's `fe/` is built OUTSIDE the host, so the two would each carry their
// own React, their own design system and their own query cache, and a module's
// `<Text>` would render outside the host's theme context. So a module bundle
// leaves the packages listed here out, and reads them from the host at load
// time: the host fills one global before it imports `remoteEntry.js`, and the
// bundle's imports of these specifiers were rewritten at build time to read it.

/** Every import specifier a module bundle takes from the host, by exact name. */
export const SHARED_MODULES = [
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-native',
  '@kromatv/module-sdk',
  '@kromatv/ui',
  '@kromatv/ui/kit',
  '@kromatv/ui/tokens',
  '@kromatv/core',
  '@kromatv/core/react',
  '@kromatv/client',
  '@kromatv/client/query',
  '@kromatv/i18n',
  '@kromatv/i18n/react',
  '@tanstack/react-query',
  '@tanstack/react-router',
  'react-call',
] as const;

export type SharedModule = (typeof SHARED_MODULES)[number];

/** `@kromatv/client/<domain>`: one entry per domain, which nothing lists, so the
 *  host provides them by pattern and the build matches the same pattern. */
const CLIENT_DOMAIN = /^@kromatv\/client\/[a-z][a-z0-9-]*$/;

/** A kit component reached below the barrel (`@kromatv/ui/kit/atoms/button`). */
const KIT_DEEP = /^@kromatv\/ui\/kit\/.+/;

/**
 * What the host provides for an import specifier: the specifier itself when it
 * is shared, `@kromatv/ui/kit` for a deep kit import (the barrel exports every
 * component, and the host holds one copy of it), and `null` for a package the
 * bundle carries itself.
 */
export function sharedKey(specifier: string): string | null {
  if (specifier === PUBLIC_NAME) return '@kromatv/module-sdk';
  if ((SHARED_MODULES as readonly string[]).includes(specifier)) return specifier;
  if (CLIENT_DOMAIN.test(specifier)) return specifier;
  if (KIT_DEEP.test(specifier)) return '@kromatv/ui/kit';
  return null;
}

/** The published package's name, and the specifier a module written against it
 *  imports the SDK by. The host provides it as `@kromatv/module-sdk`. */
export const PUBLIC_NAME = '@kromatv/sdk';

/** The global the host fills with `{ [specifier]: module namespace }` before it
 *  imports a module's remote entry. */
export const SHARED_GLOBAL = '__KROMA_SHARED__';

/** The bundle's entry file under `fe/`, and the stylesheet beside it. */
export const REMOTE_ENTRY = 'remoteEntry.js';
export const REMOTE_STYLES = 'style.css';

/** Where the server serves a module's `fe/` from. */
export function remoteEntryUrl(baseUrl: string, id: string): string {
  return `${baseUrl}/modules/${encodeURIComponent(id)}/${REMOTE_ENTRY}`;
}
