// <Section>: a titled band of a screen.
//
// An overline, an optional rule, and the content. Every settings screen, the
// admin console and the workbench panel had their own copy of this three-line
// arrangement, each with slightly different spacing, which is exactly the drift
// a design system exists to stop.

import type { ReactNode } from 'react';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Divider } from '#ui/components/atoms/divider';
import { Txt } from '#ui/components/atoms/text';

interface SectionProps extends Omit<BoxProps, 'children'> {
  /** The overline. Omit it for an untitled band that still gets the rhythm. */
  title?: string;
  /** Trailing content on the title line: a count, a filter, an action. */
  action?: ReactNode;
  /** Hairline under the title. On by default, because the rule is what makes a
   *  band read as a band rather than as loose paragraphs. */
  rule?: boolean;
  /** Space between the children. */
  gap?: number;
  children?: ReactNode;
}

function Section({
  title,
  action,
  rule = true,
  gap = 16,
  children,
  ...box
}: Readonly<SectionProps>) {
  return (
    <Box gap={12} {...box}>
      {title || action ? (
        <Box row align="center" gap={12}>
          {title ? (
            <Txt variant="overline" color="accent">
              {title}
            </Txt>
          ) : null}
          <Box flex />
          {action}
        </Box>
      ) : null}
      {rule ? <Divider spacing={0} /> : null}
      <Box gap={gap} pt={4}>
        {children}
      </Box>
    </Box>
  );
}

export type { SectionProps };
export { Section };
