import type { ModulePermissions } from '@kromatv/client/modules';
import { useT } from '@kromatv/ui';
import { Box, Callout, Text } from '@kromatv/ui/kit';
import { permissionLines } from '#web/features/admin/module-permissions';

/** What a module may do, or the banner that says it does not declare it. */
export function PermissionList({
  permissions,
}: Readonly<{ permissions: ModulePermissions | null | undefined }>) {
  const t = useT();
  if (!permissions) {
    return (
      <Callout.Root tone="accent">
        <Callout.Title>{t('admin.permissionUndeclared')}</Callout.Title>
        <Callout.Detail>{t('admin.permissionUndeclaredHint')}</Callout.Detail>
      </Callout.Root>
    );
  }
  const lines = permissionLines(permissions, t);
  if (lines.length === 0) {
    return (
      <Text variant="meta" color="textMuted">
        {t('admin.permissionNone')}
      </Text>
    );
  }
  return (
    <Box gap={4}>
      {lines.map((line) => (
        <Text key={line.text} variant="meta" color={line.danger ? 'danger' : 'textMuted'}>
          {line.text}
        </Text>
      ))}
    </Box>
  );
}

/** What an operator accepts by installing one module of a plan. */
export function ConsentNotes({
  name,
  permissions,
  widens,
  official,
}: Readonly<{
  name: string;
  permissions: ModulePermissions | null | undefined;
  widens: boolean;
  official: boolean;
}>) {
  const t = useT();
  return (
    <Box gap={8} mt={12}>
      <Text variant="overline" color="textDim">
        {t('admin.permissionHeading', { name })}
      </Text>
      {widens ? (
        <Callout.Root tone="danger">
          <Callout.Title>{t('admin.permissionWidens')}</Callout.Title>
        </Callout.Root>
      ) : null}
      {official ? null : (
        <Callout.Root tone="danger">
          <Callout.Title>{t('admin.permissionThirdParty')}</Callout.Title>
        </Callout.Root>
      )}
      <PermissionList permissions={permissions} />
    </Box>
  );
}
