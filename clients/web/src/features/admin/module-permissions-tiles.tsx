import { useT } from '@kromatv/ui';
import { Badge, Box, Icon, Row, Text } from '@kromatv/ui/kit';
import type { PermissionGroup } from '#web/features/admin/module-permissions';
import { ACCESS_TAG, CATEGORY_VIEW, GLYPH_SIZE } from '#web/features/admin/module-permissions-view';

function Tile({ group }: Readonly<{ group: PermissionGroup }>) {
  const t = useT();
  const view = CATEGORY_VIEW[group.category];
  return (
    <Box flex basis={0} minW={0} gap={3} p={12} radius="lg" bg="tint/4">
      <Icon name={view.icon} size={GLYPH_SIZE} color="glyph" />
      <Text variant="label" mt={6}>
        {t(view.title)}
      </Text>
      <Text variant="meta" color="textMuted" lines={2}>
        {group.brief}
      </Text>
      {group.access ? (
        <Box mt={5}>
          <Badge tone="neutral">{t(ACCESS_TAG[group.access])}</Badge>
        </Box>
      ) : null}
    </Box>
  );
}

const pairs = <T,>(items: readonly T[]) =>
  items.flatMap((item, at) => (at % 2 === 0 ? [[item, items[at + 1]] as const] : []));

/** A few kinds of access as a grid of two columns, each tile its glyph, its
 *  name, a few words and whether it reads or changes. */
export function PermissionTiles({ groups }: Readonly<{ groups: readonly PermissionGroup[] }>) {
  return (
    <Box gap={8}>
      {pairs(groups).map(([left, right]) => (
        <Row key={left.category} gap={8} align="stretch">
          <Tile group={left} />
          {right ? <Tile group={right} /> : <Box flex basis={0} />}
        </Row>
      ))}
    </Box>
  );
}
