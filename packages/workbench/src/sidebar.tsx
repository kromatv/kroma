// The workbench sidebar: the brand, a button that opens the command palette, and
// every story under ONE flat level of collapsible functional groups (Layout,
// Input, Overlays, ...). Deliberately not the atomic levels: those are for the
// people editing the kit, and a tree that nested them scattered every kind of
// input across three branches. The rows themselves are in `sidebar-rows.tsx`.

import { Box, styles } from '@kroma/ui/kit';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { RULE_TOP } from './chrome';
import type { StoryEntry } from './entry';
import type { WorkbenchLayout } from './layout';
import type { Page } from './page';
import { groupBy } from './registry';
import { Branch, Brand, Leaf, SearchButton } from './sidebar-rows';

interface SidebarProps {
  stories: readonly StoryEntry[];
  /** Standalone articles, listed above the component tree. */
  pages?: readonly Page[];
  selected: string;
  onSelect: (id: string) => void;
  onOpenPage?: (id: string) => void;
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
  entries: readonly StoryEntry[];
}

// Registry order, via the same `groupBy` the command palette uses.
function tree(stories: readonly StoryEntry[]): TreeGroup[] {
  return groupBy(stories, (story) => story.group).map(({ key: group, items }) => ({
    group,
    entries: items,
  }));
}

// The branch holding whatever is open, so the tree re-opens to it when the
// selection changes from elsewhere (the palette, a deep link, the landing page).
// Articles are searched as well as components: an article is selected by the same
// id, and looking only at the component tree opened the first component section
// behind a guide the reader was actually on.
function revealPath(
  groups: readonly TreeGroup[],
  pages: readonly Page[] | undefined,
  selected: string,
): Set<string> {
  const open = new Set<string>();
  const page = pages?.find((entry) => entry.id === selected);
  if (page) {
    open.add(page.group);
    return open;
  }
  for (const { group, entries } of groups) {
    if (entries.some((story) => story.id === selected)) open.add(group);
  }
  // A deep link to a story that has since moved must still leave something open.
  if (open.size === 0 && groups[0]) open.add(groups[0].group);
  return open;
}

function Sidebar({
  stories,
  pages,
  onOpenPage,
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
  const [open, setOpen] = useState(() => revealPath(groups, pages, selected));
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
      const path = revealPath(groups, pages, selected);
      if ([...path].every((key) => prev.has(key))) return prev;
      return new Set([...prev, ...path]);
    });
  }, [groups, pages, selected]);

  return (
    <Box
      // A column fills the resizable panel it sits in; a drawer is over the
      // canvas rather than in the row, so it states its own width.
      flex={onClose ? undefined : true}
      w={onClose ? layout.navWidth : undefined}
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
      {/* No scroll indicator: `base.css` asks for a thin scrollbar, which on the
          browser targets is a real one taking layout space at the scroller's own
          edge - which is the resize seam. A scrollbar under the pointer draws the
          arrow whatever is beneath it, so the cursor flickered between the two a
          pixel apart. The tree is navigated, not scrubbed. */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
      >
        {groupBy(pages ?? [], (page) => page.group).map(({ key: group, items }) => (
          <Section
            key={group}
            group={group}
            count={items.length}
            open={open.has(group)}
            onToggle={() => toggle(group)}
          >
            {items.map((page) => (
              <Leaf
                key={page.id}
                name={page.title}
                active={page.id === selected}
                onPress={() => onOpenPage?.(page.id)}
              />
            ))}
          </Section>
        ))}
        {groups.map(({ group, entries }) => (
          <Section
            key={group}
            group={group}
            count={entries.length}
            open={open.has(group)}
            onToggle={() => toggle(group)}
          >
            {entries.map((story) => (
              <Leaf
                key={story.id}
                name={story.name}
                active={story.id === selected}
                onPress={() => onSelect(story.id)}
              />
            ))}
          </Section>
        ))}
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

function Section({
  group,
  count,
  open,
  onToggle,
  children,
}: Readonly<{
  group: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}>) {
  return (
    <Box>
      <Branch label={group} count={count} open={open} onPress={onToggle} />
      {open ? children : null}
    </Box>
  );
}

const s = styles({
  scroll: { flex: true },
  list: { pb: 32, pr: 10 },
  // A drawer floats over the canvas and carries the elevation that says so; a
  // column is part of the page and is only ruled off from it.
  border: { borderRightWidth: 1, borderRightColor: 'border' },
  drawer: { borderRightWidth: 1, borderRightColor: 'borderStrong', shadow: 'pop' },
});

export { Sidebar };
