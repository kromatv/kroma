import type { ReactNode } from 'react';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Divider } from '#ui/components/atoms/divider';
import { Txt } from '#ui/components/atoms/text';

interface SectionProps extends Omit<BoxProps, 'children'> {
  title?: string;
  action?: ReactNode;
  rule?: boolean;
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
            <Txt variant="overline" color="accentText">
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
