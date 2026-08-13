// <PageHeader>: a page's opening line. Yoga has no `order`, so the Root sorts
// its children once and the actions end up at the far end whatever order they
// were written in.

import { Children, isValidElement, type ReactNode, useMemo } from 'react';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { BackButton } from '#ui/components/molecules/back-button';

interface PageHeaderRootProps extends Omit<BoxProps, 'children'> {
  /** A `<PageHeader.Actions>` must be a DIRECT child to be pinned to the far
   *  end; every other child joins the title column. */
  children?: ReactNode;
}

interface Buckets {
  back: ReactNode[];
  column: ReactNode[];
  actions: ReactNode[];
}

// Parts are matched by a tag, not by function identity: a hot reload swaps this
// module for a new one while the pages that built the elements still hold the
// old functions, and an identity check then sorts every part into the title
// column. `Symbol.for` is looked up in the global registry, so both copies
// agree.
const PART = Symbol.for('kroma.pageHeader.part');

type Part = 'back' | 'actions';

function tag<T extends object>(component: T, part: Part): T {
  return Object.assign(component, { [PART]: part });
}

function partOf(child: ReactNode): Part | null {
  if (!isValidElement(child)) return null;
  const type = child.type as { [PART]?: Part } | undefined;
  return type?.[PART] ?? null;
}

function sort(children: ReactNode): Buckets {
  const at: Buckets = { back: [], column: [], actions: [] };
  for (const child of Children.toArray(children)) {
    const part = partOf(child);
    if (part === 'actions') at.actions.push(child);
    else if (part === 'back') at.back.push(child);
    else at.column.push(child);
  }
  return at;
}

function Root({ children, ...box }: Readonly<PageHeaderRootProps>) {
  const at = useMemo(() => sort(children), [children]);
  return (
    <Box row align="center" justify="space-between" gap={24} wrap {...box}>
      <Box row align="center" gap={BACK_GAP} shrink={1} style={MIN_W}>
        {at.back}
        <Box shrink={1} style={MIN_W}>
          {at.column}
        </Box>
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

interface PageHeaderBackProps {
  /** Where it goes, named: "Modules", not "Back". A reader should know the
   *  destination before pressing. */
  label: string;
  onPress: () => void;
}

/** The way out, beside the heading. Reading order is where a reader looks to
 *  leave, so it sits before the title rather than among the page's actions at
 *  the far end. */
function Back({ label, onPress }: Readonly<PageHeaderBackProps>) {
  return <BackButton diameter={36} label={label} onPress={onPress} />;
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
const BACK_GAP = 14;
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
 *   <PageHeader.Back label="Modules" onPress={toList} />
 *   <PageHeader.Title icon="flame">Tendances</PageHeader.Title>
 *   <PageHeader.Actions>
 *     <Button variant="primary" label="Ajouter" onPress={add} />
 *   </PageHeader.Actions>
 * </PageHeader.Root>
 * ```
 */
const PageHeader = {
  Root,
  Back: tag(Back, 'back'),
  Title,
  Subtitle,
  Actions: tag(Actions, 'actions'),
};

export type { PageHeaderBackProps, PageHeaderRootProps, PageHeaderTitleProps };
export { PageHeader };
