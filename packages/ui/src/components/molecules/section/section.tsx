import { Children, isValidElement, type ReactNode, useMemo } from 'react';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Divider } from '#ui/components/atoms/divider';
import { Text, type TextProps } from '#ui/components/atoms/text';
import { style } from '#ui/core';

interface SectionRootProps extends Omit<BoxProps, 'children'> {
  /** Space between the band's content rows, not between them and the header.
   *  Defaults to 16. */
  gap?: number;
  /** A `<Section.Header>` must be a DIRECT child to sit above the rule; every
   *  other child is content. */
  children?: ReactNode;
}

interface Buckets {
  header: ReactNode[];
  body: ReactNode[];
}

function sort(children: ReactNode): Buckets {
  const at: Buckets = { header: [], body: [] };
  for (const child of Children.toArray(children)) {
    if (isValidElement(child) && child.type === Header) at.header.push(child);
    else at.body.push(child);
  }
  return at;
}

function Root({ gap = 16, children, ...box }: Readonly<SectionRootProps>) {
  const at = useMemo(() => sort(children), [children]);
  return (
    <Box gap={12} {...box}>
      {at.header}
      <Box gap={gap} pt={4}>
        {at.body}
      </Box>
    </Box>
  );
}

/** The band's opening row, and the rule under it. The rule is the header's
 *  own, so a band written without a header carries none. */
function Header({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Box gap={12}>
      <Box row align="center" gap={12}>
        {children}
      </Box>
      <Divider />
    </Box>
  );
}

// A band sits under whatever titles the screen it is on, so it is a level-2
// heading. `aria-level` is react-native-web's prop: React Native's types stop
// at what its own platforms read, and a header given no level renders as an
// <h1>, which is the screen's.
const BAND_HEADING = { accessibilityRole: 'header', 'aria-level': 2 } as TextProps;

/** The overline naming the band, and the band's heading to assistive tech. */
function Title({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Text {...BAND_HEADING} variant="overline" color="accentText">
      {children}
    </Text>
  );
}

/** The band's controls, pinned to the far end of the header row. */
function Actions({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Box row wrap align="center" gap={12} style={PUSH}>
      {children}
    </Box>
  );
}

const PUSH = style({ marginLeft: 'auto' });

/**
 * A titled band: an overline, a rule, and the content under both.
 *
 * ```tsx
 * <Section.Root>
 *   <Section.Header>
 *     <Section.Title>Lecture</Section.Title>
 *   </Section.Header>
 *   <PlaybackCard />
 * </Section.Root>
 *
 * <Section.Root>
 *   <Section.Header>
 *     <Section.Title>Lecture</Section.Title>
 *     <Section.Actions>
 *       <Button size="sm" label="Tout voir" onPress={seeAll} />
 *     </Section.Actions>
 *   </Section.Header>
 *   <PlaybackCard />
 * </Section.Root>
 * ```
 */
const Section = { Root, Header, Title, Actions };

export type { SectionRootProps };
export { Section };
