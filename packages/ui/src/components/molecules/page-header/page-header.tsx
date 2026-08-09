// <PageHeader>: a page's opening line - display title (with an optional quiet
// suffix), a subtitle under it, and the page-level action pinned to the other
// end. The title is a real heading, so assistive tech can land on it.

import type { ReactNode } from 'react';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';

interface PageHeaderProps extends Omit<BoxProps, 'children'> {
  title: string;
  /** A quiet tail on the title ("Films", a count). */
  suffix?: string;
  subtitle?: string;
  /** The page-level action (usually one <Button variant="primary">). */
  action?: ReactNode;
}

function PageHeader({ title, suffix, subtitle, action, ...box }: Readonly<PageHeaderProps>) {
  return (
    <Box row align="center" justify="space-between" gap={24} wrap {...box}>
      <Box shrink={1} style={MIN_W}>
        <Txt variant="h1" accessibilityRole="header">
          {title}
          {suffix ? (
            <Txt variant="h1" color="text/40" style={QUIET}>
              {' '}
              {suffix}
            </Txt>
          ) : null}
        </Txt>
        {subtitle ? (
          <Txt variant="body" color="textDim" style={SUBTITLE}>
            {subtitle}
          </Txt>
        ) : null}
      </Box>
      {action}
    </Box>
  );
}

const MIN_W = { minWidth: 0 } as const;
const QUIET = { fontWeight: '400' } as const;
const SUBTITLE = { marginTop: 6 } as const;

export type { PageHeaderProps };
export { PageHeader };
