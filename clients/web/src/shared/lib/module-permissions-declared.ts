import type { DeclaredAccess } from '@kromatv/client/modules';
import type { Access, PermissionSource } from '#web/shared/lib/module-permissions';

interface Declaration extends Pick<PermissionSource, 'storage' | 'settings'> {
  permissions?: object | null;
}

const lists = (access: Access | null | undefined) =>
  [access?.read, access?.write].some((list) => (list?.length ?? 0) > 0);

/** Whether a declaration names a permission, a core table or a setting. */
export const declaresAccess = (declared: Declaration): boolean =>
  Boolean(declared.permissions) || lists(declared.storage?.core) || lists(declared.settings);

/** What a catalog row, a plan row or an uploaded bundle declares: null when it
 *  names no permission, core table or setting. */
export function declaredSource(
  declared: DeclaredAccess & { official?: boolean },
): PermissionSource | null {
  if (!declaresAccess(declared)) {
    return null;
  }
  const { permissions, storage, settings, helpers, official } = declared;
  return {
    permissions: permissions ?? {},
    storage,
    settings,
    helpers,
    official: official ?? false,
  };
}
