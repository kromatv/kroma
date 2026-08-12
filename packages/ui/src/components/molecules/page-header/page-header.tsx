// <PageHeader>: a page's opening line. Yoga has no `order`, so the Root sorts
// its children once and the actions end up at the far end whatever order they
// were written in.

import { Children, isValidElement, type ReactNode, useMemo } from 'react';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';

interface PageHeaderRootProps extends Omit<BoxProps, 'children'> {
  /** A `<PageHeader.Actions>` must be a DIRECT child to be pinned to the far
   *  end; every other child joins the title column. */
  children?: ReactNode;
}

interface Buckets {
  column: ReactNode[];
  actions: ReactNode[];
}

function sort(children: ReactNode): Buckets {
  const at: Buckets = { column: [], actions: [] };
  for (const child of Children.toArray(children)) {
    if (isValidElement(child) && child.type === Actions) at.actions.push(child);
    else at.column.push(child);
  }
  return at;
}

function Root({ children, ...box }: Readonly<PageHeaderRootProps>) {
  const at = useMemo(() => sort(children), [children]);
  return (
    <Box row align="center" justify="space-between" gap={24} wrap {...box}>
      <Box shrink={1} style={MIN_W}>
        {at.column}
      </Box>
      {at.actions}
    </Box>
  );
}

interface PageHeaderTitleProps {
  /** A quiet tail after the title: a count, a category. */
  suffix?: string;
  /** A glyph before the title, drawn in the accent at heading scale. */
  icon?: IconName;
  children: ReactNode;
}

/** The page's heading. It carries the header role, so a screen reader lands
 *  on it and the glyph beside it is not announced. */
function Title({ suffix, icon, children }: Readonly<PageHeaderTitleProps>) {
  const heading = (
    <Text variant="h1" accessibilityRole="header">
      {children}
      {suffix ? (
        <Text variant="h1" color="text/40" style={QUIET}>
          {' '}
          {suffix}
        </Text>
      ) : null}
    </Text>
  );
  if (!icon) return heading;
  return (
    <Box row align="center" gap={GLYPH_GAP}>
      <Icon name={icon} size={GLYPH_SIZE} thickness={2} color="accent" />
      <Box shrink={1} style={MIN_W}>
        {heading}
      </Box>
    </Box>
  );
}

/** The line under the title: what the page holds, in one sentence. */
function Subtitle({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Text variant="body" color="textDim" style={SUBTITLE}>
      {children}
    </Text>
  );
}

/** The page-level controls, pinned to the far end of the header. */
function Actions({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Box row wrap align="center" gap={12} style={PUSH}>
      {children}
    </Box>
  );
}

const MIN_W = { minWidth: 0 } as const;
const QUIET = { fontWeight: '400' } as const;
const SUBTITLE = { marginTop: 6 } as const;
const PUSH = { marginLeft: 'auto' } as const;
const GLYPH_GAP = 10;
const GLYPH_SIZE = 26;

/**
 * A page's opening line: the heading, a line under it, and the page-level
 * actions pinned to the other end.
 *
 * ```tsx
 * <PageHeader.Root>
 *   <PageHeader.Title>Bibliotheques</PageHeader.Title>
 *   <PageHeader.Subtitle>3 dossiers surveilles</PageHeader.Subtitle>
 * </PageHeader.Root>
 *
 * <PageHeader.Root>
 *   <PageHeader.Title icon="flame">Tendances</PageHeader.Title>
 *   <PageHeader.Actions>
 *     <Button variant="primary" label="Ajouter" onPress={add} />
 *   </PageHeader.Actions>
 * </PageHeader.Root>
 * ```
 */
const PageHeader = { Root, Title, Subtitle, Actions };

export type { PageHeaderRootProps, PageHeaderTitleProps };
export { PageHeader };
