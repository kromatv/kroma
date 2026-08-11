// The workbench sidebar: the brand, a button that opens the command palette, and
// every story under ONE flat level of collapsible functional groups (Layout,
// Input, Overlays, ...). Deliberately not the atomic levels: those are for the
// people editing the kit, and a tree that nested them scattered every kind of
// input across three branches.
//
// Everything is a `Focusable` rather than a link, so the same tree works with a
// mouse in a browser and a D-pad on a television.

import { Box, Focusable, Icon, IconButton, styles, sv, Txt } from '@kroma/ui/kit';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { RULE_TOP } from './chrome';
import { commandHint, Kbd } from './command';
import type { WorkbenchLayout } from './layout';
import { groupBy, type Story } from './story';

interface SidebarProps {
  stories: readonly Story[];
  selected: string;
  onSelect: (id: string) => void;
  onSearch: () => void;
  // `brand` and `footer` are slots: this package has no design system of its own,
  // so it renders whatever the host hands it and nothing when handed nothing.
  brand?: ReactNode;
  title?: string;
  footer?: ReactNode;
  layout: WorkbenchLayout;
  // Only set while the tree is a drawer, where it has to be dismissible.
  onClose?: () => void;
}

interface TreeGroup {
  group: string;
  entries: readonly Story[];
}

// Registry order, via the same `groupBy` the command palette uses.
function tree(stories: readonly Story[]): TreeGroup[] {
  return groupBy(stories, (story) => story.group).map(({ key: group, items }) => ({
    group,
    entries: items,
  }));
}

// The branch holding one story, so the tree re-opens to it when the selection
// changes from elsewhere (the palette, a deep link).
function revealPath(groups: readonly TreeGroup[], selected: string): Set<string> {
  const open = new Set<string>();
  for (const { group, entries } of groups) {
    if (entries.some((story) => story.id === selected)) open.add(group);
  }
  // A deep link to a story that has since moved must still leave something open.
  if (open.size === 0 && groups[0]) open.add(groups[0].group);
  return open;
}

function Sidebar({
  stories,
  selected,
  onSelect,
  onSearch,
  brand,
  title = 'Workbench',
  footer,
  layout,
  onClose,
}: Readonly<SidebarProps>) {
  const groups = useMemo(() => tree(stories), [stories]);
  // Folded state is per branch and lives here rather than in the shell: it is how
  // the list is being read, not part of what the workbench is showing, and it
  // should survive changing story (which it does - the drawer remounts, a column
  // does not).
  const [open, setOpen] = useState(() => revealPath(groups, selected));
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  // A story chosen from the palette (or arrived at by deep link) has to become
  // visible here. Additive, never a reset: the branches someone opened to compare
  // two components stay open behind the one that just got revealed.
  useEffect(() => {
    setOpen((prev) => {
      const path = revealPath(groups, selected);
      if ([...path].every((key) => prev.has(key))) return prev;
      return new Set([...prev, ...path]);
    });
  }, [groups, selected]);

  return (
    <Box
      w={layout.navWidth}
      bg="surface1"
      shrink={0}
      // A drawer floats over the canvas, so it carries the elevation that says
      // so; a column is part of the page and is only ruled off from it.
      style={onClose ? s.drawer : s.border}
    >
      <Brand brand={brand} title={title} count={stories.length} onClose={onClose} />
      <Box px={12} pb={10}>
        <SearchButton onPress={onSearch} />
      </Box>
      <ScrollView style={s.scroll} contentContainerStyle={s.list}>
        {groups.map(({ group, entries }) => {
          const groupOpen = open.has(group);
          return (
            <Box key={group}>
              <Branch
                label={group}
                count={entries.length}
                open={groupOpen}
                onPress={() => toggle(group)}
              />
              {groupOpen
                ? entries.map((story) => (
                    <Leaf
                      key={story.id}
                      story={story}
                      active={story.id === selected}
                      onPress={() => onSelect(story.id)}
                    />
                  ))
                : null}
            </Box>
          );
        })}
      </ScrollView>
      {footer ? (
        // Outside the ScrollView, so it stays put however long the tree gets,
        // and ruled off so it reads as a note about the tool rather than the
        // last entry in the list.
        <Box px={16} py={12} style={RULE_TOP}>
          {footer}
        </Box>
      ) : null}
    </Box>
  );
}

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
        <Txt variant="meta" color="accent" style={s.brand}>
          {title}
        </Txt>
        <Txt variant="meta" color="textDim" style={s.tally}>
          {`${count} components`}
        </Txt>
      </Box>
      <Box flex />
      {onClose ? (
        <IconButton
          variant="ghost"
          size={CLOSE_BOX}
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
      <Txt variant="meta" color="textDim" style={s.searchInk}>
        Search
      </Txt>
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
          <Txt variant="meta" style={slots.label} lines={1}>
            {label}
          </Txt>
          <Box flex />
          <Txt variant="meta" color="textDim" style={s.count}>
            {count}
          </Txt>
        </>
      )}
    </Focusable>
  );
}

function Leaf({
  story,
  active,
  onPress,
}: Readonly<{ story: Story; active: boolean; onPress: () => void }>) {
  return (
    <Focusable
      label={story.name}
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
          <Txt variant="body" style={slots.label} lines={1}>
            {story.name}
          </Txt>
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
  scroll: { flex: true },
  list: { pb: 32, pr: 10 },
  // A drawer floats over the canvas and carries the elevation that says so; a
  // column is part of the page and is only ruled off from it.
  border: { borderRightWidth: 1, borderRightColor: 'border' },
  drawer: { borderRightWidth: 1, borderRightColor: 'borderStrong', shadow: 'pop' },
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

export type { SidebarProps, TreeGroup };
export { revealPath, Sidebar, tree };
