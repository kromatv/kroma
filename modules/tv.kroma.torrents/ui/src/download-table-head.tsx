import { type TableHeading, useT } from '@kroma/module-sdk';
import { Box, Table, Text } from '@kroma/ui/kit';
import { COLUMN_GAP, FRAME_INSET } from './download-columns';

export function DownloadTableHead({ headings }: Readonly<{ headings: TableHeading[] }>) {
  const t = useT();
  return (
    <Box bg="surface2">
      <Table.Header>
        <Table.Row>
          {headings.map(({ id, labelKey, sorted }, at) => (
            <Table.Cell key={id}>
              {labelKey ? (
                <Text
                  variant="overline"
                  color={sorted ? 'accent' : 'textDim'}
                  lines={1}
                  pl={at === 0 ? FRAME_INSET : COLUMN_GAP}
                >
                  {t(labelKey)}
                </Text>
              ) : null}
            </Table.Cell>
          ))}
        </Table.Row>
      </Table.Header>
    </Box>
  );
}
