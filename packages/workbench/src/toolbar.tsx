// The canvas toolbar: one menu per lens (viewport, surface, theme, host-added)
// that applies to whatever story is open, and the buttons that take the story
// somewhere else. A lens itself is drawn by `toolbar-menu.tsx`.

import {
  ARROW,
  Box,
  type ColorValue,
  Focusable,
  HAND,
  type IconName,
  styles,
  webWindow,
} from '@kroma/ui/kit';
import { type ColorToken, colors } from '@kroma/ui/tokens';
import { useCallback, useState } from 'react';
import { RULE } from './chrome';
import { type CopyState, useCopy } from './clipboard';
import { StoryHistory } from './history-menu';
import type { WorkbenchLayout } from './layout';
import { openWebLink } from './link';
import { useStorySource } from './source';
import { PREVIEW_THEMES } from './themes';
import { type Choice, IconTool, Lens, Sep } from './toolbar-menu';
import { canRotate, SURFACES, VIEWPORTS, type ViewportName } from './viewport';

interface ToolbarProps {
  lenses?: readonly ToolbarLens[];
  viewport: ViewportName;
  onViewport: (next: ViewportName) => void;
  surface: ColorToken;
  onSurface: (next: ColorToken) => void;
  theme: string;
  onTheme: (next: string) => void;
  rotate: boolean;
  onRotate: (next: boolean) => void;
  full: boolean;
  onFull: (next: boolean) => void;
  onMenu?: () => void;
  layout: WorkbenchLayout;
}

const FRAMES: Choice<ViewportName>[] = (['fit', 'tv', 'phone', 'tablet'] as const).map((value) => {
  const frame = VIEWPORTS[value];
  return {
    value,
    label: frame?.label ?? value,
    glyph: frame?.glyph,
    note: frame?.size ? `${frame.size.width} × ${frame.size.height}` : undefined,
  };
});

const SURFACE_LABEL: Record<string, string> = {
  bg: 'Page',
  surface1: 'Card',
  surface2: 'Raised',
};

// The accent IS the identity here: the swatch is how you tell the themes apart
// before committing to one.
const THEMES: Choice<string>[] = PREVIEW_THEMES.map(({ id, label, theme }) => ({
  value: id,
  label,
  swatch: theme.colors.accent as ColorValue,
}));

/** A lens the host app adds to the toolbar, drawn after the built-ins and
 * behaving exactly like them. */
interface ToolbarLens {
  id: string;
  name: string;
  glyph?: IconName;
  choices: readonly Choice<string>[];
  value: string;
  onChange: (next: string) => void;
}

function Toolbar({
  lenses,
  viewport,
  onViewport,
  surface,
  onSurface,
  theme,
  onTheme,
  rotate,
  onRotate,
  full,
  onFull,
  onMenu,
  layout,
}: Readonly<ToolbarProps>) {
  // Single id, not a per-lens flag: opening one lens closes any other.
  const [open, setOpen] = useState<string | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const lens = useCallback(
    (id: string) => ({
      open: open === id,
      onOpen: () => setOpen(open === id ? null : id),
      onClose: close,
    }),
    [open, close],
  );
  const terse = layout.mode === 'compact';

  const surfaces: Choice<string>[] = SURFACES.map((token) => ({
    value: token,
    label: SURFACE_LABEL[token] ?? token,
    swatch: colors[token],
  }));
  return (
    // z above the canvas so an open menu stays over the stage.
    <Box z={30} style={RULE}>
      {/* Invisible scrim, a `Focusable` so a remote can dismiss the menu too.
          Lives outside the menu because it must cover the whole window, not
          just the trigger. */}
      {open ? (
        <Focusable
          label="Close menu"
          ring={false}
          onPress={close}
          style={[s.scrim, { height: layout.height }]}
        />
      ) : null}
      {/* The row wears the hand so the 4px between two tools does not fall back
          to the page's arrow and flicker as the pointer crosses it; the spacer
          in the middle is not a control and says so. */}
      <Box row align="center" gap={4} px={layout.gutter - 8} py={5} bg="bg" z={2} style={HAND}>
        {onMenu ? (
          <>
            <IconTool glyph="list" label="Browse components" onPress={onMenu} />
            <Sep />
          </>
        ) : null}

        <Lens
          {...lens('frame')}
          name="Viewport"
          choices={FRAMES}
          value={viewport}
          onChange={onViewport}
          terse={terse}
        />
        {/* Absent, not disabled, on `fit` and on the television. */}
        {canRotate(viewport) ? (
          <IconTool
            glyph={rotate ? 'device-mobile' : 'device-mobile-rotated'}
            label={rotate ? 'Show the frame upright' : 'Turn the frame on its side'}
            active={rotate}
            onPress={() => onRotate(!rotate)}
          />
        ) : null}
        <Lens
          {...lens('surface')}
          name="Surface"
          glyph="palette"
          choices={surfaces}
          value={surface}
          onChange={(next) => onSurface(next as ColorToken)}
          terse={terse}
        />
        <Lens
          {...lens('theme')}
          name="Theme"
          glyph="color-swatch"
          choices={THEMES}
          value={theme}
          onChange={onTheme}
          terse={terse}
        />
        {lenses?.map((host) => (
          <Lens
            key={host.id}
            {...lens(host.id)}
            name={host.name}
            glyph={host.glyph}
            choices={host.choices}
            value={host.value}
            onChange={host.onChange}
            terse={terse}
          />
        ))}

        <Box flex style={ARROW} />

        {/* Both take the story somewhere else, so one rule closes the pair; it
            belongs to CopyLink and disappears with it. */}
        {/* Sharing the lens state gives the panel the scrim above, and closes
            any open menu the moment it opens. */}
        <StoryHistory {...lens('history')} />
        <ViewSource />
        <CopyLink />
        <IconTool
          glyph={full ? 'arrows-minimize' : 'arrows-maximize'}
          label={full ? 'Show the tree and inspector' : 'Give the canvas the whole window'}
          active={full}
          onPress={() => onFull(!full)}
        />
      </Box>
    </Box>
  );
}

function CopyLink() {
  const { available, state, copy } = useCopy();
  const onPress = useCallback(() => copy(webWindow()?.location?.href), [copy]);
  if (!available) return null;
  return (
    <>
      <IconTool
        glyph={LINK_FACE[state].glyph}
        label={LINK_FACE[state].label}
        ink={LINK_FACE[state].ink}
        onPress={onPress}
      />
      <Sep />
    </>
  );
}

function ViewSource() {
  const source = useStorySource();
  if (!source) return null;
  return (
    <IconTool
      glyph="brand-github"
      label={source.dirty ? SOURCE_UNCOMMITTED : SOURCE_LABEL}
      onPress={() => openWebLink(source.href)}
    />
  );
}

const SOURCE_LABEL = 'Read this component’s source on GitHub';
const SOURCE_UNCOMMITTED = `${SOURCE_LABEL}, as it was at the last commit`;

const LINK_FACE: Record<CopyState, { label: string; glyph: IconName; ink: ColorToken }> = {
  idle: { label: 'Copy a link to this story', glyph: 'link', ink: 'textMuted' },
  copied: { label: 'Link copied', glyph: 'check', ink: 'success' },
  failed: { label: 'Could not copy the link', glyph: 'alert-triangle', ink: 'danger' },
};

const s = styles({
  // `right: 0` keeps the scrim inside the canvas column, which must never scroll
  // sideways.
  scrim: { absolute: true, top: 0, right: 0, left: 0, z: 1 },
});

export type { Choice, ToolbarLens };
export { Toolbar };
