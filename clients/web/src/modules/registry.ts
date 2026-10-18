import type { KromaClient } from '@kromatv/client';
import { addCatalogs } from '@kromatv/core';
import { createEventBus, ModuleRegistry } from '@kromatv/module-sdk';
import { createRuntimeRemotes } from './remotes';

/** One registry, bus and loader for the lifetime of a mounted web module host. */
export function createModuleRuntime(client?: KromaClient) {
  const registry = new ModuleRegistry(addCatalogs);
  const bus = createEventBus();
  const remotes = createRuntimeRemotes(client);
  let holds = 0;
  let generation = 0;
  function retain(): () => void {
    holds += 1;
    generation += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      holds -= 1;
      const releasedAt = ++generation;
      queueMicrotask(() => {
        if (holds > 0 || generation !== releasedAt) return;
        remotes.dispose();
        for (const id of registry.ids()) registry.unregister(id);
      });
    };
  }
  return { registry, bus, remotes, retain };
}
export type ModuleRuntime = ReturnType<typeof createModuleRuntime>;
