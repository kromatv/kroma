// Slots: how a CORE page shows something only a module can build.
//
// The core cannot import a module. It does not know which are installed, and a
// page that named one would break the moment it was disabled -- yet the request
// page has to show release search, which is entirely the Acquisition module's
// business. So the page renders a NAME, and whichever enabled module claims that
// name fills it. Nothing in the core moves when a module comes or goes; the page
// falls back to saying the feature is not there.
//
// The names and their props are declared once, in `./module`'s `SlotProps`, so
// neither side can drift from the other.

import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { useModuleEnabledCheck } from './admin/engines';
import type { SlotName, SlotProps } from './module';
import type { ModuleRegistry, ModuleSlotEntry } from './registry';

const SlotRegistryContext = createContext<ModuleRegistry | null>(null);

/** Hands the shell's registry to every `<ModuleSlot>` below it. Mounted once,
 *  beside `<AdminHostProvider>`. Without it a slot renders its fallback, which
 *  is what a shell that contributes no modules should show anyway. */
export function ModuleSlotProvider({
  registry,
  children,
}: Readonly<{ registry: ModuleRegistry; children: ReactNode }>) {
  return <SlotRegistryContext.Provider value={registry}>{children}</SlotRegistryContext.Provider>;
}

/** What is registered for `slot`, before the enabled check. */
export function useSlotEntries(slot: SlotName): ModuleSlotEntry[] {
  const registry = useContext(SlotRegistryContext);
  return useMemo(() => registry?.slotsFor(slot) ?? [], [registry, slot]);
}

type ModuleSlotProps<Name extends SlotName> = {
  name: Name;
  /** Shown when no enabled module fills the slot: the module is absent, or off.
   *  Absent fallback renders nothing, for a slot that is a decoration. */
  fallback?: ReactNode;
} & SlotProps[Name];

/**
 * Render whatever enabled modules contribute to `name`, in their declared order.
 *
 * ```tsx
 * <ModuleSlot
 *   name="requests.detail"
 *   requestId={req.id}
 *   kind={req.kind}
 *   title={req.title}
 *   canGrab={canModerate}
 *   fallback={<NoAcquisitionModule />}
 * />
 * ```
 */
export function ModuleSlot<Name extends SlotName>({
  name,
  fallback = null,
  ...props
}: Readonly<ModuleSlotProps<Name>>) {
  const registered = useSlotEntries(name);
  const isEnabled = useModuleEnabledCheck();
  const entries = registered.filter((entry) => isEnabled(entry.moduleId));
  // Disabled counts as absent: the fallback is what "this needs a module you do
  // not have" looks like, and turning one off has to reach the same state as
  // never installing it.
  if (entries.length === 0) return <>{fallback}</>;
  return (
    <>
      {entries.map((entry) => {
        const Component = entry.component as (p: Record<string, unknown>) => ReactNode;
        return <Component key={`${entry.moduleId}:${entry.slot}`} {...props} />;
      })}
    </>
  );
}
