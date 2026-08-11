// The canvas toolbar: one menu per lens (viewport, surface, host-added) that
// applies to whatever story is open.

import {
  Box,
  type ColorValue,
  Focusable,
  Icon,
  IconButton,
  type IconName,
  styles,
  sv,
  Text,
  webWindow,
} from '@kroma/ui/kit';
import { type ColorToken, colors } from '@kroma/ui/tokens';
import { type ReactNode, useCallback, useState } from 'react';
import { canRotate, SURFACES, VIEWPORTS, type ViewportName } from './canvas';
import { RULE } from './chrome';
import { type CopyState, useCopy } from './clipboard';
import { useEscapeKey } from './command';
import type { WorkbenchLayout } from './layout';
import { PREVIEW_THEMES } from './themes';

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

interface Choice<T extends string> {
  value: T;
  label: string;
  glyph?: IconName;
  swatch?: ColorValue;
  note?: string;
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
      <Box row align="center" gap={4} px={layout.gutter - 8} py={5} bg="bg" z={2}>
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

        <Box flex />

        {/* The rule belongs to CopyLink and disappears with it. */}
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

function Lens<T extends string>({
  open,
  onOpen,
  onClose,
  name,
  glyph,
  choices,
  value,
  onChange,
  terse,
}: Readonly<{
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  name: string;
  glyph?: IconName;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (next: T) => void;
  terse: boolean;
}>) {
  const current = choices.find((choice) => choice.value === value);
  return (
    <Box>
      <Focusable
        label={`${name}: ${current?.label ?? value}`}
        ring={false}
        onPress={onOpen}
        sv={lensTrigger}
        vars={{ open }}
      >
        {({ slots }) => (
          <>
            <Face choice={current} fallback={glyph} on={open} />
            {terse ? null : (
              <Text variant="meta" style={slots.label}>
                {current?.label ?? value}
              </Text>
            )}
            <Icon
              name={open ? 'chevron-up' : 'chevron-down'}
              size={13}
              color={open ? 'textMuted' : 'textDim'}
            />
          </>
        )}
      </Focusable>
      {open ? (
        <Menu onClose={onClose}>
          {choices.map((choice) => (
            <Item
              key={choice.value}
              choice={choice}
              fallback={glyph}
              chosen={choice.value === value}
              onPress={() => {
                onChange(choice.value);
                onClose();
              }}
            />
          ))}
        </Menu>
      ) : null}
    </Box>
  );
}

function Face({
  choice,
  fallback,
  on,
}: Readonly<{ choice?: Choice<string>; fallback?: IconName; on: boolean }>) {
  if (choice?.swatch) {
    return (
      <Box w={12} h={12} radius={3} bg={choice.swatch} borderWidth={1} border="borderStrong" />
    );
  }
  const name = choice?.glyph ?? fallback;
  if (!name) return null;
  return <Icon name={name} size={15} color={on ? 'accent' : 'textMuted'} />;
}

function Menu({ onClose, children }: Readonly<{ onClose: () => void; children: ReactNode }>) {
  useEscapeKey(onClose);
  return (
    <Box absolute top="100%" left={0} mt={6} minW={186} z={2} style={s.panel} bg="surface2" p={5}>
      {children}
    </Box>
  );
}

function Item({
  choice,
  fallback,
  chosen,
  onPress,
}: Readonly<{
  choice: Choice<string>;
  fallback?: IconName;
  chosen: boolean;
  onPress: () => void;
}>) {
  return (
    <Focusable label={choice.label} ring={false} onPress={onPress} sv={menuItem} vars={{ chosen }}>
      {({ slots }) => (
        <>
          <Face choice={choice} fallback={fallback} on={chosen} />
          <Text variant="meta" style={slots.label}>
            {choice.label}
          </Text>
          <Box flex />
          {choice.note ? (
            <Text variant="meta" color="textDim" style={s.itemNote}>
              {choice.note}
            </Text>
          ) : null}
          <Box w={14} align="center">
            {chosen ? <Icon name="check" size={14} color="accent" /> : null}
          </Box>
        </>
      )}
    </Focusable>
  );
}

function IconTool({
  glyph,
  label,
  active = false,
  onPress,
}: Readonly<{ glyph: IconName; label: string; active?: boolean; onPress: () => void }>) {
  return (
    <IconButton
      variant="ghost"
      size={TOOL_BOX}
      radius="sm"
      active={active}
      label={label}
      ring={false}
      focusScale={1}
      onPress={onPress}
    >
      <Icon name={glyph} size={16} color={active ? 'accent' : 'textMuted'} />
    </IconButton>
  );
}

function CopyLink() {
  const { available, state, copy } = useCopy();
  const onPress = useCallback(() => copy(webWindow()?.location?.href), [copy]);
  if (!available) return null;
  return (
    <>
      <IconButton
        variant="ghost"
        size={TOOL_BOX}
        radius="sm"
        label={LINK_FACE[state].label}
        ring={false}
        focusScale={1}
        onPress={onPress}
      >
        <Icon name={LINK_FACE[state].glyph} size={16} color={LINK_FACE[state].ink} />
      </IconButton>
      <Sep />
    </>
  );
}

const LINK_FACE: Record<CopyState, { label: string; glyph: IconName; ink: ColorToken }> = {
  idle: { label: 'Copy a link to this story', glyph: 'link', ink: 'textMuted' },
  copied: { label: 'Link copied', glyph: 'check', ink: 'success' },
  failed: { label: 'Could not copy the link', glyph: 'alert-triangle', ink: 'danger' },
};

function Sep() {
  return <Box w={1} h={18} mx={5} bg="border" />;
}

const lensTrigger = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 7,
      px: 9,
      py: 7,
      radius: 'sm',
      border: 'transparent',
      _focus: { bg: 'white/6' },
    },
    label: { fontSize: 12.5, fontWeight: '600', color: 'textMuted' },
  },
  variants: {
    open: {
      true: {
        root: { bg: 'surface2', border: 'borderStrong', _focus: { bg: 'surface2' } },
        label: { color: 'text' },
      },
    },
  },
  defaults: { open: false },
});
const TOOL_BOX = 32;
const s = styles({
  // `right: 0` keeps the scrim inside the canvas column, which must never scroll
  // sideways.
  scrim: { absolute: true, top: 0, right: 0, left: 0, z: 1 },
  panel: { border: 'borderStrong', radius: 'md', shadow: 'pop' },
  itemNote: { fontSize: 11 },
});
// A row in an OPEN menu: the surface underneath is already lifted, where the
// chrome's plain focus wash reads as nothing.
const menuItem = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 9,
      h: 32,
      px: 8,
      radius: 'sm',
      _focus: { bg: 'white/7' },
    },
    label: { fontSize: 12.5, fontWeight: '600', color: 'textMuted' },
  },
  variants: {
    chosen: { true: { label: { color: 'text' } } },
  },
  defaults: { chosen: false },
});

export type { Choice, ToolbarLens, ToolbarProps };
export { FRAMES, Toolbar };
