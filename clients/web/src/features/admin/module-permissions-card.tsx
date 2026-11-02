import { useT } from '@kromatv/ui';
import { Box, Button, Row, Surface, Text } from '@kromatv/ui/kit';
import {
  permissionGroups,
  type PermissionSource,
  tileGroups,
} from '#web/features/admin/module-permissions';
import { PermissionsSheet } from '#web/features/admin/module-permissions-sheet';
import { PermissionTiles } from '#web/features/admin/module-permissions-tiles';
import { ModuleVerdict } from '#web/features/admin/module-permissions-verdict';

/** A module's security at a glance: one verdict on its isolation, the few kinds
 *  of access that weigh most, and "Détails" for everything. A null `source` is
 *  a module that does not say what it does. */
export function SecurityCard({
  id,
  name,
  source,
}: Readonly<{ id: string; name: string; source: PermissionSource | null }>) {
  const t = useT();
  const groups = source ? permissionGroups(source, t) : [];
  const tiles = tileGroups(groups);
  return (
    <Surface elevated radius="xl" pad="md" gap={14}>
      <Row between gap={12}>
        <Text variant="cardTitle" accessibilityRole="header">
          {t('modulePermissions.title')}
        </Text>
        {groups.length > 0 ? (
          <Box mr={-12}>
            <Button
              variant="ghost"
              size="sm"
              iconRight="chevron-right"
              label={t('modulePermissions.details')}
              onPress={() => void PermissionsSheet.call({ modules: [{ id, name, source }] })}
            />
          </Box>
        ) : null}
      </Row>
      <ModuleVerdict source={source} />
      {tiles.length > 0 ? <PermissionTiles groups={tiles} /> : null}
    </Surface>
  );
}
