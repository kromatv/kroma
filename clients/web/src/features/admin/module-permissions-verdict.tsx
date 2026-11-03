import type { MessageKey, Translate } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Callout, IconWell } from '@kromatv/ui/kit';
import type { ReactNode } from 'react';
import { permissionGroups, type PermissionSource } from '#web/features/admin/module-permissions';
import { extendedSentence } from '#web/features/admin/module-permissions-overview';

/** The verdict a security summary opens with: amber when something reaches past
 *  the module's isolation, green when nothing does. */
export function Verdict({
  extended,
  title,
  children,
}: Readonly<{ extended: boolean; title: string; children?: ReactNode }>) {
  return (
    <Callout.Root tone={extended ? 'accent' : 'success'}>
      <Callout.Media>
        <IconWell
          name={extended ? 'shield-exclamation' : 'shield-check'}
          size="xs"
          tone={extended ? 'accent' : 'success'}
        />
      </Callout.Media>
      <Callout.Title>{title}</Callout.Title>
      {children}
    </Callout.Root>
  );
}

function isolatedHint(source: PermissionSource | null, t: Translate): MessageKey {
  if (!source) return 'modulePermissions.undeclaredHint';
  return permissionGroups(source, t).length > 0
    ? 'modulePermissions.isolatedHint'
    : 'modulePermissions.isolatedNothing';
}

/** One module's verdict. A null `source` is a module that does not say what it
 *  does, which leaves it no network and no program to start. */
export function ModuleVerdict({ source }: Readonly<{ source: PermissionSource | null }>) {
  const t = useT();
  const sentence = source ? extendedSentence(source, t) : null;
  if (sentence) {
    return (
      <Verdict extended title={t('modulePermissions.extended')}>
        <Callout.Detail>{sentence}</Callout.Detail>
      </Verdict>
    );
  }
  return (
    <Verdict extended={false} title={t('modulePermissions.isolated')}>
      <Callout.Detail>{t(isolatedHint(source, t))}</Callout.Detail>
    </Verdict>
  );
}
