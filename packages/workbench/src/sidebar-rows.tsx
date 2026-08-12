// The rows the sidebar is built out of: who this is, the search key, a foldable
// section and a story under one.
//
// Everything is a `Focusable` rather than a link, so the same tree works with a
// mouse in a browser and a D-pad on a television.

import { Box, Focusable, Icon, IconButton, Kbd, styles, sv, Text } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import { commandHint } from './command';
import { glyphFor } from './registry';

// Who this is, at the top of the tree rather than in a bar over the whole page. That is
// Storybook's arrangement, and the reason for it is that the canvas is the subject: the only
// full-width chrome should be the toolbar acting ON it.
function Brand({
  brand,
  title,
  count,
  onClose,
}: Readonly<{ brand?: ReactNode; title: string; count: number; onClose?: () => void }>) {
  return (
    <Box row align="center" gap={10} px={16} pt={16} pb={14}>
      {brand}
      <Box>
        <Text variant="meta" color="accent" style={s.brand}>
          {title}
        </Text>
        <Text variant="meta" color="textDim" style={s.tally}>
          {`${count} components`}
        </Text>
      </Box>
      <Box flex />
      {onClose ? (
        <IconButton
          variant="ghost"
          diameter={CLOSE_BOX}
          radius="sm"
          label="Close component list"
          ring={false}
          focusScale={1}
          onPress={onClose}
        >
          <Icon name="x" size={16} color="textMuted" />
        </IconButton>
      ) : null}
    </Box>
  );
}

// The search row: a button that looks like the field it replaced, with the accelerator on it.
// Storybook's, and it is the right shape - a field you cannot type into would be a lie, but a
// field-shaped button carrying `⌘ K` teaches the shortcut to everyone who ever clicks it.
function SearchButton({ onPress }: Readonly<{ onPress: () => void }>) {
  return (
    <Focusable label="Search components" ring={false} onPress={onPress} sv={searchButton}>
      <Icon name="search" size={15} color="textDim" />
      <Text variant="meta" color="textDim" style={s.searchInk}>
        Search
      </Text>
      <Box flex />
      <Kbd>{commandHint()}</Kbd>
    </Focusable>
  );
}

// A foldable section row: the twisty, the name, and how many components are under
// it. The chevron ROTATES in place rather than swapping glyph, which is the one
// detail that makes a tree feel like a tree.
function Branch({
  label,
  count,
  open,
  onPress,
}: Readonly<{ label: string; count: number; open: boolean; onPress: () => void }>) {
  return (
    <Focusable
      label={`${open ? 'Collapse' : 'Expand'} ${label}`}
      ring={false}
      onPress={onPress}
      expanded={open}
      sv={treeRow}
      vars={{ kind: 'group' }}
      style={s.branchRow}
    >
      {({ slots }) => (
        <>
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} color="textDim" />
          <Icon name={glyphFor(label)} size={15} color={open ? 'accent' : 'textDim'} />
          <Text variant="meta" style={slots.label} lines={1}>
            {label}
          </Text>
          <Box flex />
          <Text variant="meta" color="textDim" style={s.count}>
            {count}
          </Text>
        </>
      )}
    </Focusable>
  );
}

function Leaf({
  name,
  active,
  onPress,
}: Readonly<{ name: string; active: boolean; onPress: () => void }>) {
  return (
    <Focusable
      label={name}
      ring={false}
      onPress={onPress}
      sv={treeRow}
      vars={{ active }}
      style={s.leafRow}
    >
      {({ slots }) => (
        <>
          {/* The rail every leaf hangs off. It is what keeps a folded branch's
              children reading as children once the chevron above them is scrolled
              out of sight. */}
          <Box w={1} h={16} bg={active ? 'transparent' : 'border'} mr={7} shrink={0} />
          <Text variant="body" style={slots.label} lines={1}>
            {name}
          </Text>
        </>
      )}
    </Focusable>
  );
}

// How far the leaves step in under their section row.
const INDENT = 12;

// The 16pt glyph in the box the old padded shape came to.
const CLOSE_BOX = 30;

const s = styles({
  brand: { fontWeight: '700', fontSize: 13 },
  tally: { fontSize: 10.5 },
  searchInk: { fontSize: 12.5 },
  count: { fontSize: 10.5 },
  branchRow: { ml: 8 },
  leafRow: { ml: 8 + INDENT },
});
const searchButton = sv({
  base: {
    row: true,
    align: 'center',
    gap: 9,
    px: 10,
    py: 8,
    radius: 'sm',
    border: 'border',
    bg: 'surface2',
    _focus: { border: 'borderStrong' },
  },
});
// One row shape for every node of the tree, so a branch and a leaf sit on the
// same rhythm and only their indent tells them apart.
const treeRow = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 6,
      px: 8,
      py: 6,
      radius: 'sm',
      _focus: { bg: 'white/6' },
    },
    label: { fontSize: 13.5, color: 'textMuted' },
  },
  variants: {
    kind: {
      group: {
        label: { fontSize: 11.5, letterSpacing: 0.5, textTransform: 'uppercase', color: 'text' },
      },
      story: {},
    },
    // The open story is FILLED - amber, with ink to match - rather than tinted:
    // the sidebar is read at a glance from across a desk, and a 16% wash was not
    // enough to find your place in sixty rows.
    active: {
      true: {
        root: { bg: 'accent', _focus: { bg: 'accent' } },
        label: { color: 'accentInk', fontWeight: '700' },
      },
    },
  },
  defaults: { kind: 'story', active: false },
});

export { Branch, Brand, Leaf, SearchButton };
