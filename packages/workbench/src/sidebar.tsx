// The workbench sidebar: the brand, a button that opens the command palette, and
// every story as a collapsible tree. Stories nest by LEVEL (atoms, molecules,
// organisms), then by GROUP within it (Actions, Input, Media, State).
//
// Everything is a `Focusable` rather than a link, so the same tree works with a
// mouse in a browser and a D-pad on a television.

import { Box, Focusable, Icon, IconButton, Txt } from '@kroma/ui/kit';
import { colors, radius, shadow } from '@kroma/ui/tokens';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { FOCUS_WASH, RULE_TOP } from './chrome';
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

interface TreeTier {
  tier: string;
  count: number;
  groups: readonly TreeGroup[];
}

// Registry order, via the same `groupBy` the command palette uses.
function tree(stories: readonly Story[]): TreeTier[] {
  return groupBy(stories, (story) => story.tier).map(({ key: tier, items: entries }) => ({
    tier,
    count: entries.length,
    groups: groupBy(entries, (story) => story.group).map(({ key: group, items }) => ({
      group,
      entries: items,
    })),
  }));
}

// Branch keys along the path to one story, so the tree re-opens to it when the
// selection changes from elsewhere (the palette, a deep link).
function revealPath(tiers: readonly TreeTier[], selected: string): Set<string> {
  const open = new Set<string>();
  for (const tier of tiers) {
    for (const { group, entries } of tier.groups) {
      if (!entries.some((story) => story.id === selected)) continue;
      open.add(tier.tier);
      open.add(`${tier.tier}/${group}`);
    }
  }
  // A deep link to a story that has since moved must still leave something open.
  if (open.size === 0 && tiers[0]) {
    open.add(tiers[0].tier);
    if (tiers[0].groups[0]) open.add(`${tiers[0].tier}/${tiers[0].groups[0].group}`);
  }
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
  const tiers = useMemo(() => tree(stories), [stories]);
  // Folded state is per branch and lives here rather than in the shell: it is how
  // the LIST is being read, not part of what the workbench is showing, and it
  // should survive changing story (which it does - the drawer remounts, a column
  // does not).
  const [open, setOpen] = useState(() => revealPath(tiers, selected));
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
      const path = revealPath(tiers, selected);
      if ([...path].every((key) => prev.has(key))) return prev;
      return new Set([...prev, ...path]);
    });
  }, [tiers, selected]);

  return (
    <Box
      w={layout.navWidth}
      bg="surface1"
      shrink={0}
      // A drawer floats over the canvas, so it carries the elevation that says
      // so; a column is part of the page and is only ruled off from it.
      style={onClose ? DRAWER : BORDER}
    >
      <Brand brand={brand} title={title} count={stories.length} onClose={onClose} />
      <Box px={12} pb={10}>
        <SearchButton onPress={onSearch} />
      </Box>
      <ScrollView style={SCROLL} contentContainerStyle={LIST}>
        {tiers.map((tier) => {
          const tierOpen = open.has(tier.tier);
          return (
            <Box key={tier.tier}>
              <Branch
                label={tier.tier}
                count={tier.count}
                open={tierOpen}
                depth={0}
                onPress={() => toggle(tier.tier)}
              />
              {tierOpen
                ? tier.groups.map(({ group, entries }) => (
                    <Group
                      key={group}
                      group={group}
                      entries={entries}
                      // One group per level means the group row would only
                      // repeat the level, so the leaves hang straight off it.
                      solo={tier.groups.length === 1}
                      open={open}
                      tier={tier.tier}
                      selected={selected}
                      onToggle={toggle}
                      onSelect={onSelect}
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
        <Txt variant="meta" color="accent" style={BRAND}>
          {title}
        </Txt>
        <Txt variant="meta" color="textDim" style={TALLY}>
          {`${count} components`}
        </Txt>
      </Box>
      <Box flex />
      {onClose ? (
        <IconButton
          variant="ghost"
          size={CLOSE_BOX}
          radius={radius.sm}
          label="Close component list"
          ring={false}
          focusScale={1}
          focusedStyle={FOCUS_WASH}
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
    <Focusable
      label="Search components"
      ring={false}
      onPress={onPress}
      style={SEARCH}
      focusedStyle={SEARCH_FOCUS}
    >
      <Icon name="search" size={15} color="textDim" />
      <Txt variant="meta" color="textDim" style={SEARCH_INK}>
        Search
      </Txt>
      <Box flex />
      <Kbd>{commandHint()}</Kbd>
    </Focusable>
  );
}

// A foldable row: the twisty, the name, and how many leaves are under it. The chevron ROTATES
// in place rather than swapping glyph, which is the one detail that makes a tree feel like a
// tree.
// One group inside a tier: its own row, and the stories under it. Its own component
// so the tree is two nested maps rather than three.
function Group({
  group,
  entries,
  solo,
  open,
  tier,
  selected,
  onToggle,
  onSelect,
}: Readonly<{
  group: string;
  entries: readonly Story[];
  // The only group in its tier: the row would just repeat the tier's name.
  solo: boolean;
  open: ReadonlySet<string>;
  tier: string;
  selected: string;
  onToggle: (key: string) => void;
  onSelect: (id: string) => void;
}>) {
  const key = `${tier}/${group}`;
  const groupOpen = solo || open.has(key);
  return (
    <Box>
      {solo ? null : (
        <Branch
          label={group}
          count={entries.length}
          open={groupOpen}
          depth={1}
          onPress={() => onToggle(key)}
        />
      )}
      {groupOpen
        ? entries.map((story) => (
            <Leaf
              key={story.id}
              story={story}
              active={story.id === selected}
              depth={solo ? 1 : 2}
              onPress={() => onSelect(story.id)}
            />
          ))
        : null}
    </Box>
  );
}

function Branch({
  label,
  count,
  open,
  depth,
  onPress,
}: Readonly<{ label: string; count: number; open: boolean; depth: number; onPress: () => void }>) {
  return (
    <Focusable
      label={`${open ? 'Collapse' : 'Expand'} ${label}`}
      ring={false}
      onPress={onPress}
      style={[ITEM, { marginLeft: 8 + depth * INDENT }]}
      focusedStyle={FOCUS_WASH}
    >
      <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} color="textDim" />
      <Txt
        variant="meta"
        color={depth === 0 ? 'text' : 'textMuted'}
        style={depth === 0 ? TIER_INK : GROUP_INK}
        lines={1}
      >
        {label}
      </Txt>
      <Box flex />
      <Txt variant="meta" color="textDim" style={COUNT}>
        {count}
      </Txt>
    </Focusable>
  );
}

// A story. The open one is FILLED - amber, with ink to match - rather than tinted: the sidebar
// is read at a glance from across a desk, and a 16% wash was not enough to find your place in
// sixty rows.
function Leaf({
  story,
  active,
  depth,
  onPress,
}: Readonly<{ story: Story; active: boolean; depth: number; onPress: () => void }>) {
  return (
    <Focusable
      label={story.name}
      ring={false}
      onPress={onPress}
      style={[ITEM, { marginLeft: 8 + depth * INDENT }, active && ITEM_ACTIVE]}
      focusedStyle={active ? undefined : FOCUS_WASH}
    >
      {/* The rail every leaf hangs off. It is what keeps a folded branch's
          children reading as children once the chevron above them is scrolled
          out of sight. */}
      <Box w={1} h={16} bg={active ? 'transparent' : 'border'} mr={7} shrink={0} />
      <Txt
        variant="body"
        color={active ? 'accentInk' : 'textMuted'}
        style={active ? LEAF_INK_ACTIVE : LEAF_INK}
        lines={1}
      >
        {story.name}
      </Txt>
    </Focusable>
  );
}

// How far one level of the tree steps in.
const INDENT = 12;

const SCROLL = { flex: 1 } as const;
const LIST = { paddingBottom: 32, paddingRight: 10 } as const;
const BORDER = { borderRightWidth: 1, borderRightColor: colors.border } as const;
const DRAWER = {
  borderRightWidth: 1,
  borderRightColor: colors.borderStrong,
  boxShadow: shadow.pop,
};
// The 16pt glyph in the box the old padded shape came to.
const CLOSE_BOX = 30;
const BRAND = { fontWeight: '700', fontSize: 13 } as const;
const TALLY = { fontSize: 10.5 } as const;
const SEARCH = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 9,
  paddingHorizontal: 10,
  paddingVertical: 8,
  borderRadius: radius.sm,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surface2,
} as const;
const SEARCH_FOCUS = { borderColor: colors.borderStrong } as const;
const SEARCH_INK = { fontSize: 12.5 } as const;
// One row shape for every node of the tree, so a branch and a leaf sit on the
// same rhythm and only their indent tells them apart.
const ITEM = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  paddingHorizontal: 8,
  paddingVertical: 6,
  borderRadius: radius.sm,
} as const;
const ITEM_ACTIVE = { backgroundColor: colors.accent } as const;
const TIER_INK = { fontSize: 11.5, letterSpacing: 0.5, textTransform: 'uppercase' } as const;
const GROUP_INK = { fontSize: 12 } as const;
const LEAF_INK = { fontSize: 13.5 } as const;
const LEAF_INK_ACTIVE = { fontSize: 13.5, fontWeight: '700' } as const;
const COUNT = { fontSize: 10.5 } as const;

export type { SidebarProps, TreeGroup, TreeTier };
export { revealPath, Sidebar, tree };
