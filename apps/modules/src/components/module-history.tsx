import { Badge } from '@kroma/ui/kit/atoms/badge';
import { Box, Column, Row } from '@kroma/ui/kit/atoms/box';
import { Button } from '@kroma/ui/kit/atoms/button';
import { Divider } from '@kroma/ui/kit/atoms/divider';
import { Text } from '@kroma/ui/kit/atoms/text';
import type { VersionRow } from '#site/lib/history';
import { mb } from '#site/lib/ui';

export interface ModuleHistoryProps {
  rows: VersionRow[];
}

/** Every version of the module that has been released, newest first. */
export function ModuleHistory({ rows }: Readonly<ModuleHistoryProps>) {
  if (rows.length === 0) return null;
  return (
    <Column gap={12}>
      <Text variant="overline" color="accentText">
        Version history
      </Text>
      <Box bg="surface1" border="border" radius="xl" overflow="hidden">
        {rows.map((row, at) => (
          <Column key={row.tag}>
            {at > 0 ? <Divider /> : null}
            <Row gap={16} px={18} py={14} wrap align="center">
              <Box shrink={0} basis={90}>
                <Badge tone={at === 0 ? 'success' : 'neutral'}>v{row.version}</Badge>
              </Box>
              <Box grow={1} shrink={1} basis={200} minW={0}>
                <Text color="textDim" variant="meta" lines={1}>
                  {row.publishedAt ? row.publishedAt.slice(0, 10) : row.tag}
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
