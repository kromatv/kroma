// A module page's own identity, supplied by the host that mounts it.
//
// A module must never name itself: its id lives in `module.json`, and a copy in
// TypeScript is one more thing to keep in sync. The host already resolves which
// module a route belongs to, so it provides that id here and the module reads
// its API through `useModuleApi()` without ever spelling the id out. Naming a
// module is then reserved for what it should mean: addressing a DIFFERENT one.

import { type ModuleApi, ModuleId } from '@kromatv/client/modules';
import type { MessageKey, Messages, ScopedTranslate, TVars, VarsOf } from '@kromatv/i18n';
import { useScopedT } from '@kromatv/ui';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import { useAdminHost } from './admin/context';

const ModuleIdContext = createContext<ModuleId | null>(null);
const GateContext = createContext<(() => void) | null>(null);

function gate(ready: () => Promise<void>): () => void {
  let open = false;
  let pending: Promise<void> | null = null;
  const opened = () => {
    open = true;
  };
  return () => {
    if (open) return;
    pending ??= ready().then(opened, opened);
    throw pending;
  };
}

/** Mounted by a host that hands its modules the shared packages on demand:
 *  every `ModuleScope` below suspends until `ready` settles, then renders the
 *  module. `ready` is called once, by the first scope to render. */
export function ModuleSharedProvider({
  ready,
  children,
}: Readonly<{ ready: () => Promise<void>; children: ReactNode }>) {
  const [wait] = useState(() => gate(ready));
  return <GateContext.Provider value={wait}>{children}</GateContext.Provider>;
}

/** Mounted by the host around a module's page, slot or panel, carrying that
 *  module's id. */
export function ModuleScope({ id, children }: Readonly<{ id: string; children: ReactNode }>) {
  useContext(GateContext)?.();
  return <ModuleIdContext.Provider value={ModuleId.parse(id)}>{children}</ModuleIdContext.Provider>;
}

/**
 * What a module's own messages take, keyed by message key. The kroma CLI
 * augments it from the module's `locales/`, in a `messages.d.ts` it keeps
 * beside the front end:
 *
 * ```ts
 * declare module '@kromatv/sdk' {
 *   interface ModuleRegister {
 *     messages: { 'page.title': {}; 'page.hello': { answer: string | number } };
 *   }
 * }
 * ```
 */
// oxlint-disable-next-line typescript/no-empty-interface -- the augmentation target; a type alias cannot be reopened.
export interface ModuleRegister {}

type OwnMessages = ModuleRegister extends { messages: infer M extends Record<string, object> }
  ? M
  : null;

type WithApp<Own> = {
  [K in keyof Own | keyof Messages]: K extends keyof Own
    ? Own[K]
    : K extends keyof Messages
      ? Messages[K]
      : never;
};

// `string`, or a template with a hole in it like `flag.${string}`: a type that
// names no finite set of keys. A key written out, or a union of them, is not.
type OpenEnded<S extends string> = Record<never, never> extends Record<S, unknown> ? S : never;

/** A translator checked against `M`, which maps each key to what it takes. */
export interface CheckedTranslate<M> {
  <K extends keyof M & string>(key: K, ...vars: VarsOf<M, K>): string;
  /** A key only runtime can name: one held in a `string`, or built from a
   *  template. A key written out never lands here, so a typo in one still
   *  fails to compile. */
  <S extends string>(key: OpenEnded<S>, vars?: TVars): string;
}

/**
 * A module's translator. Once the module's messages are declared, a key
 * written out is checked against them and the app's, with the variables its
 * message takes, and a key held in a `string` variable is taken as it comes.
 * Before that, it accepts any key, as a scoped translator does.
 */
export type ModuleTranslate = OwnMessages extends null
  ? ScopedTranslate<MessageKey>
  : CheckedTranslate<string extends MessageKey ? OwnMessages : WithApp<OwnMessages>>;

/** Translate against THIS module's catalog first, then the app's. Outside a
 *  module page it is the app's translator unchanged. */
export function useT(): ModuleTranslate {
  const id = useContext(ModuleIdContext);
  return useScopedT()(id ?? '') as ModuleTranslate;
}

/** This module's own admin API, bound to `/api/admin/m/<its id>`. Paths are
 *  relative to that mount, so `get('/vpn')` reads the module's own `/vpn`. */
export function useModuleApi(): ModuleApi {
  const id = useContext(ModuleIdContext);
  const { client } = useAdminHost();
  const api = useMemo(() => (id === null ? null : client.modules.api(id)), [client, id]);
  if (api === null) {
    throw new Error('useModuleApi must be used inside a module page (the host mounts ModuleScope)');
  }
  return api;
}

/** Build a module's typed API hook from a factory over its `ModuleApi`.
 *
 *  `moduleApiHook(factory)` binds to whichever module the host is rendering
 *  (via `ModuleScope`), so the module never names itself. The `(id, factory)`
 *  form binds an explicit id instead: that is the shape for an API other
 *  packages call: the id others reach the module at, published once, next to
 *  the methods it addresses. */
export function moduleApiHook<T>(factory: (api: ModuleApi) => T): () => T;
export function moduleApiHook<T>(id: string, factory: (api: ModuleApi) => T): () => T;
export function moduleApiHook<T>(
  idOrFactory: string | ((api: ModuleApi) => T),
  boundFactory?: (api: ModuleApi) => T,
): () => T {
  if (typeof idOrFactory === 'string') {
    const id = ModuleId.parse(idOrFactory);
    const factory = boundFactory as (api: ModuleApi) => T;
    return function useBoundModuleApi(): T {
      const { client } = useAdminHost();
      return useMemo(() => factory(client.modules.api(id)), [client]);
    };
  }
  const factory = idOrFactory;
  return function useScopedModuleApi(): T {
    const api = useModuleApi();
    return useMemo(() => factory(api), [api]);
  };
}
