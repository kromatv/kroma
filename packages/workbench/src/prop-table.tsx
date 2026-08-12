// The Props tab's body: a plain component's props, or one section per part of a
// compound one.

import { Box, styles, Text } from '@kroma/ui/kit';
import { RULE } from './chrome';
import { MONO } from './code';
import { RichText } from './docs';
import type { PropDoc, PropSection } from './props';

interface PropTableProps {
  name: string;
  sections: readonly PropSection[];
}

function PropRows({ props }: Readonly<{ props: readonly PropDoc[] }>) {
  return (
    <Box>
      {props.map((prop, at) => (
        <Box
          key={prop.name}
          gap={3}
          pt={at === 0 ? 0 : 12}
          pb={12}
          style={at === props.length - 1 ? undefined : RULE}
        >
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
      ))}
    </Box>
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
  propName: { fontFamily: MONO, fontSize: 12.5, fontWeight: '700' },
  propType: { fontFamily: MONO, fontSize: 11.5, shrink: 1 },
  propRequired: { fontSize: 10, letterSpacing: 0.3, textTransform: 'uppercase' },
  part: { fontFamily: MONO, fontSize: 12, fontWeight: '700' },
  partCount: { fontSize: 10.5, fontFamily: MONO },
});

export type { PropTableProps };
export { PropTable };
