// The web + desktop runtime-load tier: remotes discovered from `GET /api/modules`,
// loaded from `/modules/<id>/remoteEntry.js`. The Chromium-53 TV tier stays bundled.

import { sessionToken } from '@kroma/core';
import type { KromaModule, ModuleManifest, ModuleRegistry } from '@kroma/module-sdk';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { apiBase } from '#web/shared/lib/api';

interface RemoteSpec {
  name: string;
  entry: string;
  module: string;
}

async function discoverRemotes(): Promise<RemoteSpec[]> {
  const token = sessionToken();
  const res = await fetch(`${apiBase()}/api/modules`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return [];
  const mods = (await res.json()) as ModuleManifest[];
  return mods
    .filter((m) => m.feRemote != null && m.enabled !== false)
    .map((m) => {
      const name = mfName(m.id);
      const expose = (m.feRemote as { module: string }).module.replace(/^\.\//, '');
      return {
        name,
        entry: `${apiBase()}/modules/${encodeURIComponent(m.id)}/remoteEntry.js`,
        module: `${name}/${expose}`,
      };
    });
}

// Must stay in sync with each module's vite `federation({ name })`.
function mfName(id: string): string {
  return id.replace(/\W/g, '_');
}

// Init'd once (shared React singleton); remotes are added incrementally so a
// module installed at runtime loads with no page reload.
let mfReady: Promise<typeof import('@module-federation/runtime')> | null = null;
const loadedRemotes = new Set<string>();
const injectedStyles = new Set<string>();

// A runtime module carries its own CSS next to its remoteEntry; one that ships
// none just 404s the link, removed silently to avoid console noise.
function injectRemoteStyles(entry: string): void {
  const href = entry.replace(/remoteEntry\.js(\?.*)?$/, 'style.css');
  if (injectedStyles.has(href)) return;
  injectedStyles.add(href);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.kromaModuleStyles = '';
  link.onerror = () => link.remove();
  document.head.appendChild(link);
}

function ensureMf(): Promise<typeof import('@module-federation/runtime')> {
  mfReady ??= import('@module-federation/runtime')
    .then((mf) => {
      mf.init({
        name: 'kroma_web_host',
        remotes: [],
        shared: {
          react: {
            version: React.version,
            lib: () => React,
            shareConfig: { singleton: true, requiredVersion: '^19' },
          },
          'react-dom': {
            version: React.version,
            lib: () => ReactDOM,
            shareConfig: { singleton: true, requiredVersion: '^19' },
          },
        },
      });
      return mf;
    })
    .catch((e) => {
      mfReady = null; // let a later call retry
      throw e;
    });
  return mfReady;
}

/** Load any not-yet-loaded frontend remotes into `registry` and return the ids
 *  newly registered. Re-callable, best-effort, and a no-op during SSR. */
export async function loadRuntimeRemotes(registry: ModuleRegistry): Promise<string[]> {
  if (typeof window === 'undefined') return [];
  let specs: RemoteSpec[];
  try {
    specs = await discoverRemotes();
  } catch (e) {
    console.warn('[modules] remote discovery failed', e);
    return [];
  }
  const fresh = specs.filter((s) => !loadedRemotes.has(s.name));
  if (fresh.length === 0) return [];

  let mf: typeof import('@module-federation/runtime');
  try {
    mf = await ensureMf();
  } catch (e) {
    console.warn('[modules] federation init failed', e);
    return [];
  }
  mf.registerRemotes(fresh.map((s) => ({ name: s.name, entry: s.entry, type: 'module' as const })));
  fresh.forEach((s) => {
    injectRemoteStyles(s.entry);
  });

  const added: string[] = [];
  await Promise.all(
    fresh.map(async (s) => {
      loadedRemotes.add(s.name);
      try {
        const mod = (await mf.loadRemote<{ default: KromaModule }>(s.module))?.default;
        if (mod && !registry.has(mod.id)) {
          registry.register(mod);
          try {
            registry.order(); // validate deps; a bad one must not break the rest
            added.push(mod.id);
          } catch (err) {
            registry.unregister(mod.id);
            loadedRemotes.delete(s.name);
            console.warn(
              `[modules] runtime remote "${s.name}" has unmet deps/cycle; unregistered`,
              err,
            );
          }
        }
      } catch (e) {
        loadedRemotes.delete(s.name);
        console.warn(`[modules] runtime remote "${s.name}" failed to load`, e);
      }
    }),
  );
  return added;
}

/** Whether this module's frontend was loaded as a runtime remote (vs compiled in). */
export function isLoadedRemote(id: string): boolean {
  return loadedRemotes.has(mfName(id));
}

/** Forget a remote so a later reinstall re-loads it; the already-loaded MF code
 *  stays in memory. */
export function forgetRemote(id: string): void {
  loadedRemotes.delete(mfName(id));
}
