// The Props tab's body: a plain component's props, or one section per part of a
// compound one. The rows and the rules between them are the kit's <Table>; what
// is written here is what a PROP is - its name, whether it is required, its type
// as written, and the line of prose under it.

import { Box, styles, Table, Text } from '@kroma/ui/kit';
import { RichText } from './docs';
import type { PropDoc, PropSection } from './props';

interface PropTableProps {
  name: string;
  sections: readonly PropSection[];
}

function PropRows({ props }: Readonly<{ props: readonly PropDoc[] }>) {
  return (
    <Table.Root variant="plain">
      <Table.Body>
        {props.map((prop) => (
          <Table.Row key={prop.name}>
            <Table.Cell>
              <Box gap={3}>
                <Box row align="baseline" gap={8} wrap>
                  <Text variant="meta" style={s.propName}>
                    {prop.name}
                  </Text>
                  {prop.optional ? null : (
                    <Text variant="meta" color="danger" style={s.propRequired}>
                      required
                    </Text>
                  )}
                  <Text variant="meta" color="textDim" style={s.propType} lines={1}>
                    {prop.type}
                  </Text>
                </Box>
                {prop.docs ? <RichText>{prop.docs}</RichText> : null}
              </Box>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}

function PropTable({ name, sections }: Readonly<PropTableProps>) {
  const single = sections.length === 1 ? sections[0] : undefined;
  if (single && !single.part) return <PropRows props={single.props} />;
  return (
    <Box gap={22}>
      {sections.map((section) => (
        <Box key={section.part} gap={10}>
          <Box row align="baseline" gap={8}>
            <Text variant="meta" color="accent" style={s.part}>
              {`${name}.${section.part}`}
            </Text>
            <Text variant="meta" color="textDim" style={s.partCount}>
              {section.props.length}
            </Text>
          </Box>
          <PropRows props={section.props} />
        </Box>
      ))}
    </Box>
  );
}

const s = styles({
  propName: { font: 'mono', fontSize: 12.5, fontWeight: '700' },
  propType: { font: 'mono', fontSize: 11.5, shrink: 1 },
  propRequired: { fontSize: 10, letterSpacing: 0.3, textTransform: 'uppercase' },
  part: { font: 'mono', fontSize: 12, fontWeight: '700' },
  partCount: { fontSize: 10.5, font: 'mono' },
});

export { PropTable };
