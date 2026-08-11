import type { VersionRow } from '#site/lib/history';
import { mb } from '#site/lib/ui';
import { Badge } from '#ui/components/atoms/badge';
import { Box, Column, Row } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Divider } from '#ui/components/atoms/divider';
import { Text } from '#ui/components/atoms/text';

export interface ModuleHistoryProps {
  rows: VersionRow[];
}

const span = (row: VersionRow) =>
  row.first === row.last ? `KROMA ${row.first}` : `KROMA ${row.first} to ${row.last}`;

/** Which version of the module shipped with which KROMA release. */
export function ModuleHistory({ rows }: Readonly<ModuleHistoryProps>) {
  if (rows.length === 0) return null;
  return (
    <Column gap={12}>
      <Text variant="overline" color="accentText">
        Version history
      </Text>
      <Box bg="surface1" border="border" radius="xl" overflow="hidden">
        {rows.map((row, at) => (
          <Column key={`${row.version}-${row.first}`}>
            {at > 0 ? <Divider /> : null}
            <Row gap={16} px={18} py={14} wrap align="center">
              <Box shrink={0} basis={90}>
                <Badge tone={at === 0 ? 'success' : 'neutral'}>v{row.version}</Badge>
              </Box>
              <Box grow={1} shrink={1} basis={200} minW={0}>
                <Text color="textDim" variant="meta" lines={1}>
                  {span(row)}
                  {row.firstAt ? ` · ${row.firstAt.slice(0, 10)}` : ''}
                  {row.size ? ` · ${mb(row.size)}` : ''}
                </Text>
              </Box>
              {row.url ? (
                <Box shrink={0}>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="download"
                    label="Download"
                    href={row.url}
                    role="link"
                  />
                </Box>
              ) : null}
            </Row>
          </Column>
        ))}
      </Box>
    </Column>
  );
}
