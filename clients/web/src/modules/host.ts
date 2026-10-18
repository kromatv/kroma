// Adapts the web app's providers (auth, i18n, router, session) into the neutral
// KromaHost the module SDK defines, then resolves + starts the registry.

import { sessionToken } from '@kromatv/client';
import { hasPermission } from '@kromatv/client/accounts';
import type { MessageKey, TVars } from '@kromatv/i18n';
import type { HostBase, KromaHost, ModuleManifest } from '@kromatv/module-sdk';
import { useLocale, useT } from '@kromatv/ui';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { createModuleRuntime, type ModuleRuntime } from '#web/modules/registry';
import { apiBase } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';

async function apiGet<T>(path: string): Promise<T> {
  const token = sessionToken();
  const res = await fetch(`${apiBase()}/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`GET /api${path} failed (${res.status})`);
  return (await res.json()) as T;
}

/** Resolves + starts the module registry against a host adapted from the app's
 *  providers, returning the wired host once ready. The host is built ONCE and
 *  reads the latest auth / i18n / router values through a ref: re-creating it
 *  each render would re-run the effect, call setHost, and loop (React error
 *  #185). */
export function useModuleHost(revision = 0, provided?: ModuleRuntime): KromaHost | null {
  const [owned] = useState(() => (provided ? null : createModuleRuntime()));
  const runtime = provided ?? owned;
  if (!runtime) throw new Error('Module host requires its runtime');
  const { registry: moduleRegistry, bus: appBus, remotes } = runtime;
  useEffect(() => runtime.retain(), [runtime]);
  const navigate = useNavigate();
  const t = useT();
  const locale = useLocale();
  const auth = useAuth();

  // Updated outside render (the React Compiler turns in-render mutation into an
  // update loop); the host is built once and reads the latest values through it.
  const latest = useRef({ navigate, t, locale, auth });
  useEffect(() => {
    latest.current = { navigate, t, locale, auth };
  });

  const [host, setHost] = useState<KromaHost | null>(null);
  const authed = auth.user != null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional re-run key; revision re-wires modules after install/uninstall/enable
  useEffect(() => {
    if (!authed) return;
    let alive = true;
    const base: HostBase = {
      api: {
        get: apiGet,
        listModules: () => apiGet<ModuleManifest[]>('/modules'),
      },
      auth: {
        get userId() {
          return latest.current.auth.user?.id ?? null;
        },
        can: (capability) => {
          const u = latest.current.auth.user;
          return !!u && hasPermission(u, capability as Parameters<typeof hasPermission>[1]);
        },
      },
      i18n: {
        t: (key, vars) => latest.current.t(key as MessageKey, vars as TVars | undefined),
        get locale() {
          return latest.current.locale;
        },
      },
      // The module system uses plain string paths; the concrete router types its
      // routes, so the cast lives at this single boundary.
      nav: { navigate: (to) => void latest.current.navigate({ to } as never) },
      bus: appBus,
    };
    void (async () => {
      try {
        await remotes.loadRuntimeRemotes(moduleRegistry);
        if (!alive) return;
        let skip: Set<string> | undefined;
        try {
          const listed = await apiGet<ModuleManifest[]>('/modules');
          skip = new Set(listed.filter((m) => m.enabled === false).map((m) => m.id));
        } catch {
          skip = undefined; // enabled-state unavailable; set up everything
        }
        if (!alive) return;
        const wired = await moduleRegistry.start(base, skip);
        if (alive) setHost(wired);
      } catch (e) {
        console.error('[modules] host start failed', e);
        if (alive) setHost({ ...base, getModuleApi: () => undefined });
      }
    })();
    return () => {
      alive = false;
    };
  }, [authed, revision, moduleRegistry, appBus, remotes]);
  return host;
}
