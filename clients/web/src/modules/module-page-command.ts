import type { ModuleNav } from '@kromatv/module-sdk';
import { resolveModuleIcon } from '#web/modules/module-icons';
import type { CommandDef } from '#web/shared/lib/command-menu';
import type { RoutePath } from '#web/shared/ui/route-link';

/** A module's nav entry as a row of the command menu. */
export function modulePageCommand({ label, icon, to }: ModuleNav): CommandDef {
  return { label, icon: resolveModuleIcon(icon), to: to as RoutePath };
}
