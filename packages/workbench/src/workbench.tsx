// The shell: what is selected, where that lives in the URL, and where the three
// regions go. One story on the canvas is `story-view.tsx`.

import { Box, configureRemote, Focusable, FocusScope, Resizable, styles } from '@kroma/ui/kit';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { RULE } from './chrome';
import { CommandPalette, useCommandKey } from './command';
import { type Registry, storyEntries, useStory } from './entry';
import { DOCK_COLLAPSED, MIN_CANVAS, REGION_MIN, useLayout } from './layout';
import type { Page } from './page';
import { PageView } from './page-view';
import { Panel } from './panel';
import { usePlay } from './play';
import { pathRouter, type View, type WorkbenchRouter } from './router';
import { shotStage } from './shot';
import { Sidebar } from './sidebar';
import { controlsRole } from './story';
import { StoryPending } from './story-pending';
import { playFor, renderBody, StoryCanvas, useStageView } from './story-view';
import type { ToolbarLens } from './toolbar';
import { IconTool } from './toolbar-menu';

interface WorkbenchProps {
  /** Compiled stories, or the index `indexVite` builds - the shell reads the
   *  two the same way and fetches what the index has not got yet. */
  stories: Registry;
  /** Standalone articles, addressed at `page/<id>` and listed above the tree. */
  pages?: readonly Page[];
  brand?: ReactNode;
  title?: string;
  footer?: ReactNode;
  lenses?: readonly ToolbarLens[];
  /** Defaults to the `?story=&view=` contract, degrading to memory off the web. */
  router?: WorkbenchRouter;
}

function Workbench(props: Readonly<WorkbenchProps>) {
  // In render rather than at module load or in an effect: a module-scope call
  // would reconfigure the host app's navigator on mere import, and an effect
  // runs after the children that subscribe to the remote.
  useState(configureRemote);
  return (
    <FocusScope>
      <WorkbenchShell {...props} />
    </FocusScope>
  );
}

function WorkbenchShell({
  stories,
  pages,
  brand,
  title,
  footer,
  lenses,
  router = DEFAULT_ROUTER,
}: Readonly<WorkbenchProps>) {
  // Idempotent, so a host that already indexed its library pays nothing here.
  const entries = useMemo(() => storyEntries(stories), [stories]);
  const [at, go] = router();
  // The location is the source, not a mirror: a subscribing adapter has to be
  // able to move the canvas from outside.
  const selected = at.story ?? entries[0]?.id ?? '';
  const view: View = at.view ?? 'preview';
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});

  const layout = useLayout();
  const drawer = layout.nav === 'drawer';

  const openSearch = useCallback(() => setSearchOpen(true), []);
  useCommandKey(openSearch);

  useEffect(() => {
    if (!drawer) setNavOpen(false);
  }, [drawer]);

  // A bare address opens the first article rather than the first component: the
  // guides say how to use the kit, and landing on an arbitrary component asks
  // the reader to already know their way around. Naming either in the URL wins.
  const landing = !at.story && !at.page ? pages?.[0] : undefined;
  const page = landing ?? pages?.find((entry) => entry.id === at.page);
  const entry = entries.find((candidate) => candidate.id === selected) ?? entries[0];
  // Nothing on the canvas is the story's while an article holds it, and the
  // landing address IS an article: fetching the first component there buys a
  // reader who is reading the guides nothing at all.
  const story = useStory(page ? undefined : entry);
  const args = useMemo(
    () => ({ ...story?.args, ...edits[entry?.id ?? ''] }),
    [story, edits, entry],
  );

  const stage = useStageView(story);
  const run = usePlay(story ? playFor(story, view) : undefined);

  const select = useCallback(
    (id: string) => {
      go({ story: id, view: 'preview' });
      setNavOpen(false);
    },
    [go],
  );

  const show = useCallback((next: View) => go({ view: next }), [go]);

  const openPage = useCallback(
    (id: string) => {
      go({ page: id });
      setNavOpen(false);
    },
    [go],
  );

  const openSection = useCallback((id: string) => go({ section: id }), [go]);

  const change = useCallback(
    (key: string, value: unknown) => {
      const id = entry?.id ?? '';
      setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
    },
    [entry],
  );

  if (!entry) return null;

  const controls = story ? controlsRole(story, view) : NO_CONTROLS;

  if (at.shot) {
    return shotStage({
      listOnly: !at.story,
      stories: entries,
      story,
      body: story ? renderBody(story, view, args) : null,
      surface: stage.surface,
      width: layout.width,
    });
  }

  const column = !drawer && !stage.full;
  // Nothing to inspect until the module lands: an empty panel beside a busy
  // stage reads as a component with no props rather than as one on its way.
  const inspector = Boolean(story) && !page && !stage.full;
  const compact = layout.mode === 'compact';
  const openNav = drawer && !stage.full ? () => setNavOpen(true) : undefined;

  const panel = story ? (
    <Panel
      story={story}
      args={args}
      onChange={change}
      onReset={() => setEdits((prev) => ({ ...prev, [entry.id]: {} }))}
      showControls={controls.show}
      showReset={controls.reset}
      run={run}
      layout={layout}
    />
  ) : null;

  const canvas = story ? (
    <StoryCanvas
      story={story}
      view={view}
      onView={show}
      args={args}
      run={run}
      stage={stage}
      lenses={lenses}
      layout={layout}
      onMenu={openNav}
    />
  ) : (
    <StoryPending entry={entry} stage={stage} lenses={lenses} layout={layout} onMenu={openNav} />
  );

  // An article renders instead of the canvas, and the canvas is where the
  // toolbar lives, so on a phone a page would otherwise carry no way at all to
  // reach the tree behind the drawer.
  const main = page ? (
    <Box flex minW={0}>
      {drawer && !stage.full ? (
        <Box row align="center" px={layout.gutter - 8} py={5} bg="bg" z={2} style={RULE}>
          <IconTool glyph="list" label="Browse components" onPress={() => setNavOpen(true)} />
        </Box>
      ) : null}
      <PageView page={page} layout={layout} section={at.section} onSection={openSection} />
    </Box>
  ) : (
    canvas
  );

  // Docked under the canvas rather than beside it, the inspector is a row of
  // the same column: a group of its own, and on a phone a collapsible one, so
  // shutting it gives the whole window back to the stage.
  const centre =
    inspector && layout.panel === 'below' ? (
      <Resizable.Root orientation="vertical" autoSaveId={DOCK_STORE}>
        <Resizable.Panel minSize={`${MIN_CANVAS.height}px`}>{main}</Resizable.Panel>
        <Resizable.Handle label="Resize the inspector" />
        <Resizable.Panel
          defaultSize={compact ? `${DOCK_COLLAPSED}px` : `${layout.panelHeight}px`}
          minSize={`${REGION_MIN.dock}px`}
          collapsible={compact}
          collapsedSize={`${DOCK_COLLAPSED}px`}
        >
          {panel}
        </Resizable.Panel>
      </Resizable.Root>
    ) : (
      main
    );

  const tree = (
    <Sidebar
      stories={entries}
      brand={brand}
      title={title}
      footer={footer}
      pages={pages}
      onOpenPage={openPage}
      selected={page ? page.id : entry.id}
      onSelect={select}
      onSearch={openSearch}
      layout={layout}
      {...(drawer ? { onClose: () => setNavOpen(false) } : null)}
    />
  );

  return (
    <Box flex bg="bg">
      {/* Each part is its own expression rather than a fragment holding the
          pair: a group reads its DIRECT children to learn where its panels and
          seams are, and a fragment would hide both from it. */}
      <Resizable.Root autoSaveId={COLUMN_STORE}>
        {column ? (
          <Resizable.Panel defaultSize={`${layout.navWidth}px`} minSize={`${REGION_MIN.nav}px`}>
            {tree}
          </Resizable.Panel>
        ) : null}
        {column ? <Resizable.Handle label="Resize the component list" /> : null}
        <Resizable.Panel minSize={`${MIN_CANVAS.width}px`}>{centre}</Resizable.Panel>
        {inspector && layout.panel === 'side' ? (
          <Resizable.Handle label="Resize the inspector" />
        ) : null}
        {inspector && layout.panel === 'side' ? (
          <Resizable.Panel defaultSize={`${layout.panelWidth}px`} minSize={`${REGION_MIN.panel}px`}>
            {panel}
          </Resizable.Panel>
        ) : null}
      </Resizable.Root>

      {drawer && navOpen ? <NavDrawer onClose={() => setNavOpen(false)}>{tree}</NavDrawer> : null}

      {searchOpen ? (
        <CommandPalette
          stories={entries}
          pages={pages}
          selected={page ? page.id : entry.id}
          onSelect={(id, isPage) => (isPage ? openPage(id) : select(id))}
          onClose={() => setSearchOpen(false)}
        />
      ) : null}
    </Box>
  );
}

function NavDrawer({ onClose, children }: Readonly<{ onClose: () => void; children: ReactNode }>) {
  return (
    // `z` above the toolbar's 30 and below the palette's 40. The tree hangs
    // directly off this row: a wrapper box between them collapses it, because a
    // column stretches its children on the cross axis only.
    <Box absolute top={0} right={0} bottom={0} left={0} row z={35}>
      {children}
      <Focusable label="Close component list" ring={false} onPress={onClose} style={s.scrim} />
    </Box>
  );
}

// One key per group: the columns and the dock under the canvas are two
// arrangements, and each is stored per panel count anyway.
const COLUMN_STORE = 'kroma:workbench-columns';
const DOCK_STORE = 'kroma:workbench-dock';
const s = styles({ scrim: { flex: true, bg: 'bg/60' } });

// What the panel can do while there is no story to do it to.
const NO_CONTROLS = { show: false, reset: false } as const;

// Built once: an adapter is a hook, and a fresh one per render would remount
// its state.
const DEFAULT_ROUTER = pathRouter();

export type { WorkbenchProps };
export { Workbench };
