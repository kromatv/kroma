import { useT } from '@kromatv/ui';
import { Box, Divider, Drawer, Icon, Row, Text } from '@kromatv/ui/kit';
import { Fragment } from 'react';
import { createCallable } from 'react-call';
import {
  type ModuleAccess,
  type PermissionGroup,
  permissionGroups,
} from '#web/features/admin/module-permissions';
import { CATEGORY_VIEW, GLYPH_SIZE } from '#web/features/admin/module-permissions-view';
import { ModuleVerdict } from '#web/features/admin/module-permissions-verdict';
import { listOf } from '#web/features/admin/module-permissions-words';

const FULL_SCREEN_BELOW = 640;

function SheetGroup({ group }: Readonly<{ group: PermissionGroup }>) {
  const t = useT();
  const view = CATEGORY_VIEW[group.category];
  return (
    <Row gap={14} align="flex-start">
      <Box pt={1}>
        <Icon name={view.icon} size={GLYPH_SIZE} color={group.extended ? 'accentText' : 'glyph'} />
      </Box>
      <Box flex minW={0} gap={3}>
        <Text variant="label">{t(view.title)}</Text>
        <Text variant="meta" color="textMuted">
          {group.summary}
        </Text>
        {group.extended && view.note ? (
          <Text variant="meta" color="textDim" mt={2}>
            {t(view.note)}
          </Text>
        ) : null}
        {group.details.length > 0 ? (
          <Box gap={10} mt={10} px={14} py={12} radius="lg" bg="tint/4">
            {group.details.map((detail) => (
              <Box key={`${detail.text}:${detail.hint ?? ''}`} gap={2}>
                <Text variant="meta" color="text">
                  {detail.text}
                </Text>
                {detail.hint ? (
                  <Text variant="meta" color="textDim">
                    {detail.hint}
                  </Text>
                ) : null}
              </Box>
            ))}
          </Box>
        ) : null}
      </Box>
    </Row>
  );
}

function ModuleSection({ module, named }: Readonly<{ module: ModuleAccess; named: boolean }>) {
  const t = useT();
  const groups = module.source ? permissionGroups(module.source, t) : [];
  return (
    <Box gap={20}>
      {named ? (
        <Text variant="cardTitle" accessibilityRole="header">
          {module.name}
        </Text>
      ) : null}
      <ModuleVerdict source={module.source} />
      {groups.map((group) => (
        <SheetGroup key={group.category} group={group} />
      ))}
    </Box>
  );
}

/** Everything one or several modules may do, one section per module: its
 *  verdict, then each kind of access with its particulars. */
export const PermissionsSheet = createCallable<
  Readonly<{ modules: readonly ModuleAccess[] }>,
  void
>(({ call, modules }) => {
  const t = useT();
  const [only] = modules;
  const single = modules.length === 1 && only !== undefined;
  const heading = single ? t('modulePermissions.title') : t('modulePermissions.detailsPerModule');
  const names = listOf(
    modules.map((module) => module.name),
    t,
  );
  return (
    <Drawer.Root
      open={!call.ended}
      onClose={() => call.end()}
      title={single ? t('modulePermissions.titleOf', { name: only.name }) : heading}
      width="md"
      fullBelow={FULL_SCREEN_BELOW}
    >
      <Drawer.Header>
        <Row between gap={12} align="flex-start">
          <Box minW={0} flex>
            <Text variant="h2" accessibilityRole="header">
              {heading}
            </Text>
            <Text variant="meta" color="textDim" mt={4}>
              {names}
            </Text>
          </Box>
          <Drawer.Close />
        </Row>
      </Drawer.Header>
      <Drawer.Panel>
        <Box gap={28}>
          {modules.map((module, at) => (
            <Fragment key={module.id}>
              {at > 0 ? <Divider /> : null}
              <ModuleSection module={module} named={!single} />
            </Fragment>
          ))}
        </Box>
        <Row gap={10} mt={28} mb={8}>
          <Icon name="shield-check" size={16} color="glyphDim" />
          <Text variant="meta" color="textDim" flex>
            {t('modulePermissions.denied', { count: modules.length })}
          </Text>
        </Row>
      </Drawer.Panel>
    </Drawer.Root>
  );
}, 400);
