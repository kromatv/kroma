// <List>: the bulleted, numbered or ticked list a piece of prose is written in.
//
// It is the list a DOCUMENT has, not the list a screen has: a run of settings is
// <ListRow>, and a collection long enough to scroll is <VirtualGrid>. What it
// owns is the marker column - the dot, the number, the box - and the fact that a
// number is a position the item cannot know about itself.

import { Children, isValidElement, type ReactNode, useMemo } from 'react';
import { Box } from '#ui/components/atoms/box';
import { CheckboxFace } from '#ui/components/atoms/checkbox';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { space } from '#ui/core/tokens';
import { partContext } from '#ui/lib/part-context';

interface Context {
  /** The item's number in an ordered list; null in a bulleted one. */
  marker: number | null;
}

const [ListContext, useList] = partContext<Context>('List.Root');

interface ListRootProps {
  /** Numbers the items in the order they were written, in place of bullets. */
  ordered?: boolean;
  /** Names the list to assistive tech. Draws nothing. */
  label?: string;
  /** A DIRECT <List.Item> child: only a direct child is counted, which is what
   *  lets an ordered list number itself. */
  children?: ReactNode;
}

function Root({ ordered = false, label, children }: Readonly<ListRootProps>) {
  const items = useMemo(
    () => Children.toArray(children).filter((child) => isValidElement(child)),
    [children],
  );
  // One value per position rather than one per render: a fresh object in the
  // provider re-renders every item whenever the list does.
  const places = useMemo(
    () => items.map((_, at) => ({ marker: ordered ? at + 1 : null })),
    [ordered, items],
  );
  return (
    <Box role="list" aria-label={label} style={s.list}>
      {items.map((child, at) => (
        // The document order is fixed: the position IS the identity.
        // biome-ignore lint/suspicious/noArrayIndexKey: the position IS what the provider carries
        <ListContext.Provider key={at} value={places[at] as Context}>
          {child}
        </ListContext.Provider>
      ))}
    </Box>
  );
}

interface ListItemProps {
  /** Draws a checkbox face in place of the marker: a task, ticked or not. The
   *  face is a drawing and never a control - a document is not a form. */
  checked?: boolean;
  /** A string is set in the body role; anything else is drawn as it was
   *  written, so an item can hold a paragraph or a block of its own. */
  children?: ReactNode;
}

function Item({ checked, children }: Readonly<ListItemProps>) {
  const { marker } = useList('Item');
  return (
    <Box row role="listitem" gap={space[3]} align="flex-start">
      <Marker marker={marker} checked={checked} />
      {typeof children === 'string' ? (
        <Text flex minW={0} color="textMuted">
          {children}
        </Text>
      ) : (
        <Box flex minW={0}>
          {children}
        </Box>
      )}
    </Box>
  );
}

function Marker({ marker, checked }: Readonly<{ marker: number | null; checked?: boolean }>) {
  if (checked !== undefined) {
    return (
      <Box shrink={0} style={s.task}>
        <CheckboxFace checked={checked} />
      </Box>
    );
  }
  if (marker === null) return <Box shrink={0} radius="pill" bg="textDim" style={s.bullet} />;
  return (
    <Text variant="body" color="textDim" style={s.marker}>
      {`${marker}.`}
    </Text>
  );
}

// Half the difference between the body role's line and the 20pt checkbox face,
// which lands the box on the optical centre of the first line rather than on
// its top edge.
const TASK_LIFT = 2;

const s = styles({
  list: { gap: space[2] },
  bullet: { w: 3, h: 3, mt: 10 },
  // Wide enough for a two-digit number, so the text column does not step
  // sideways at the tenth item.
  marker: { minW: 18, mt: 1 },
  task: { mt: TASK_LIFT },
});

/**
 * A bulleted, numbered or ticked list.
 *
 * ```tsx
 * <List.Root>
 *   <List.Item>Direct play whenever the client can decode it.</List.Item>
 *   <List.Item>Remux only where the container is the problem.</List.Item>
 * </List.Root>
 *
 * <List.Root ordered>
 *   <List.Item>Install the module.</List.Item>
 *   <List.Item>Give it a port.</List.Item>
 * </List.Root>
 * ```
 */
const List = { Root, Item };

export type { ListItemProps, ListRootProps };
export { List };
