// The canvas toolbar: one menu per lens (viewport, surface, host-added) that
// applies to whatever story is open.

import { Box, Focusable, Icon, IconButton, type IconName, Txt, webWindow } from '@kroma/ui/kit';
import { type ColorToken, colors, radius, shadow } from '@kroma/ui/tokens';
import { type ReactNode, useCallback, useState } from 'react';
import { canRotate, SURFACES, VIEWPORTS, type ViewportName } from './canvas';
import { FOCUS_WASH, FOCUS_WASH_STRONG, RULE } from './chrome';
import { type CopyState, useCopy } from './clipboard';
import { useEscapeKey } from './command';
import type { WorkbenchLayout } from './layout';

interface ToolbarProps {
  lenses?: readonly ToolbarLens[];
  viewport: ViewportName;
  onViewport: (next: ViewportName) => void;
  surface: ColorToken;
  onSurface: (next: ColorToken) => void;
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
  swatch?: string;
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
          style={[SCRIM, { height: layout.height }]}
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
        style={[TRIGGER, open && TRIGGER_OPEN]}
        focusedStyle={open ? undefined : FOCUS_WASH}
      >
        <Face choice={current} fallback={glyph} on={open} />
        {terse ? null : (
          <Txt variant="meta" color={open ? 'text' : 'textMuted'} style={TRIGGER_INK}>
            {current?.label ?? value}
          </Txt>
        )}
        <Icon
          name={open ? 'chevron-up' : 'chevron-down'}
          size={13}
          color={open ? 'textMuted' : 'textDim'}
        />
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
    <Box absolute top="100%" left={0} mt={6} minW={186} z={2} style={PANEL} bg="surface2" p={5}>
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
    <Focusable
      label={choice.label}
      ring={false}
      onPress={onPress}
      style={ITEM}
      focusedStyle={FOCUS_WASH_STRONG}
    >
      <Face choice={choice} fallback={fallback} on={chosen} />
      <Txt variant="meta" color={chosen ? 'text' : 'textMuted'} style={ITEM_INK}>
        {choice.label}
      </Txt>
      <Box flex />
      {choice.note ? (
        <Txt variant="meta" color="textDim" style={ITEM_NOTE}>
          {choice.note}
        </Txt>
      ) : null}
      <Box w={14} align="center">
        {chosen ? <Icon name="check" size={14} color="accent" /> : null}
      </Box>
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
      radius={radius.sm}
      active={active}
      label={label}
      ring={false}
      focusScale={1}
      focusedStyle={active ? undefined : FOCUS_WASH}
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
        radius={radius.sm}
        label={LINK_LABEL[state]}
        ring={false}
        focusScale={1}
        focusedStyle={FOCUS_WASH}
        onPress={onPress}
      >
        <Icon name={LINK_GLYPH[state]} size={16} color={LINK_INK[state]} />
      </IconButton>
      <Sep />
    </>
  );
}

const LINK_LABEL: Record<CopyState, string> = {
  idle: 'Copy a link to this story',
  copied: 'Link copied',
  failed: 'Could not copy the link',
};
const LINK_GLYPH: Record<CopyState, IconName> = {
  idle: 'link',
  copied: 'check',
  failed: 'alert-triangle',
};
const LINK_INK: Record<CopyState, ColorToken> = {
  idle: 'textMuted',
  copied: 'success',
  failed: 'danger',
};

function Sep() {
  return <Box w={1} h={18} mx={5} bg="border" />;
}

const TRIGGER = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 7,
  paddingHorizontal: 9,
  paddingVertical: 7,
  borderRadius: radius.sm,
  borderWidth: 1,
  borderColor: 'transparent',
} as const;
const TRIGGER_OPEN = {
  backgroundColor: colors.surface2,
  borderColor: colors.borderStrong,
} as const;
const TRIGGER_INK = { fontSize: 12.5, fontWeight: '600' } as const;
const TOOL_BOX = 32;
// `right: 0` keeps the scrim inside the canvas column, which must never scroll sideways.
const SCRIM = { position: 'absolute', top: 0, right: 0, left: 0, zIndex: 1 } as const;
const PANEL = {
  borderWidth: 1,
  borderColor: colors.borderStrong,
  borderRadius: radius.md,
  boxShadow: shadow.pop,
} as const;
const ITEM = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 9,
  height: 32,
  paddingHorizontal: 8,
  borderRadius: radius.sm,
} as const;
const ITEM_INK = { fontSize: 12.5, fontWeight: '600' } as const;
const ITEM_NOTE = { fontSize: 11 } as const;

export type { Choice, ToolbarLens, ToolbarProps };
export { FRAMES, Toolbar };
