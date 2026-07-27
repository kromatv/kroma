// The canvas toolbar: the lenses that apply to whatever story is open.
//
// It replaces the brand bar that used to span the whole window, and the move is
// the point rather than a tidy-up. The brand now sits at the top of the tree
// (sidebar.tsx) and this bar spans only the canvas column, so the one piece of
// full-width chrome is gone and every control on screen is visibly attached to
// the thing it acts on. That is Storybook's arrangement, and it is why a
// Storybook window reads as "a component, with tools" rather than as "an app
// containing a component".
//
// The lenses are MENUS, one per lens, and that is the whole UX argument of this
// file. Laid out flat they were nine buttons - four frames, three surfaces, two
// languages - and nine buttons is a bar that has to scroll on a laptop, that
// hides the tools you are not using behind the ones you are, and that never says
// which value is currently in force without you reading all nine. A menu says the
// current value ON the trigger, costs one row of chrome per lens, and fits a
// phone. Three triggers, and the whole state of the canvas is legible at a
// glance.
//
// The one thing menus cost is a press, so the values are still one press from the
// keyboard: the menu opens with the current option under the cursor, Escape
// closes, and a D-pad walks the panel exactly as it walks the tree.

import { Box, Focusable, Icon, IconButton, type IconName, Txt, webWindow } from '@kroma/ui/kit';
import { type ColorToken, colors, radius, shadow } from '@kroma/ui/tokens';
import { type ReactNode, useCallback, useState } from 'react';
import { canRotate, SURFACES, VIEWPORTS, type ViewportName } from './canvas';
import { FOCUS_WASH, FOCUS_WASH_STRONG, RULE } from './chrome';
import { type CopyState, useCopy } from './clipboard';
import { useEscapeKey } from './command';
import type { WorkbenchLayout } from './layout';

interface ToolbarProps {
  /** Lenses the HOST adds, drawn after the built-in ones and behaving exactly
   *  like them. This is how an app puts its own switch up here - a locale, a
   *  theme, a density - without this package knowing what a locale is. */
  lenses?: readonly ToolbarLens[];
  viewport: ViewportName;
  onViewport: (next: ViewportName) => void;
  surface: ColorToken;
  onSurface: (next: ColorToken) => void;
  /** The frame, on its side. Only ever true for a frame that turns. */
  rotate: boolean;
  onRotate: (next: boolean) => void;
  /** The canvas has the whole window: no tree, no inspector. */
  full: boolean;
  onFull: (next: boolean) => void;
  /** Present only while the story tree is a drawer. */
  onMenu?: () => void;
  layout: WorkbenchLayout;
}

/** One choice in a lens menu: what it is called, how it is pictured, and - where
 * it has one - the fact that settles it. */
interface Choice<T extends string> {
  value: T;
  label: string;
  glyph?: IconName;
  /** A colour chip instead of a glyph. The surfaces are the colour they are. */
  swatch?: string;
  /** Trailing detail, dimmed: a frame's point size. What turns "the phone one"
   *  into a choice you can make without opening it to find out. */
  note?: string;
}

/** The frames, read from the canvas's own table rather than restated here: their
 * names, their silhouettes and their sizes have exactly one home (canvas.tsx),
 * so a frame added there appears in this menu with its size already on it. */
const FRAMES: Choice<ViewportName>[] = (['fit', 'tv', 'phone', 'tablet'] as const).map((value) => {
  const frame = VIEWPORTS[value];
  return {
    value,
    label: frame?.label ?? value,
    glyph: frame?.glyph,
    note: frame?.size ? `${frame.size.width} × ${frame.size.height}` : undefined,
  };
});

/** The surfaces, named for what they ARE in the design rather than by token: a
 * component is being checked against the page, against a card, or against a
 * raised one. A scrim that reads on the page can vanish on a card. */
const SURFACE_LABEL: Record<string, string> = {
  bg: 'Page',
  surface1: 'Card',
  surface2: 'Raised',
};

/**
 * A lens the host adds to the toolbar.
 *
 * The three built-in lenses - the frame, the surface, the ones this package can
 * describe on its own - are hard-coded because they act on the CANVAS, which is
 * this package's own. Anything acting on the app inside the canvas is the app's
 * to declare, and this is the shape it declares it in. A locale switch is the
 * obvious one, and it is exactly why the type says nothing about locales.
 */
interface ToolbarLens {
  /** Unique among the toolbar's menus; it is what "which one is open" holds. */
  id: string;
  /** Names the lens for a screen reader: "Language: English". */
  name: string;
  /** Drawn on the trigger and on any choice that has no picture of its own. */
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
  // WHICH menu is open, not whether one is: opening the second lens has to shut
  // the first, or two panels overlap and neither belongs to a trigger.
  const [open, setOpen] = useState<string | null>(null);
  const close = useCallback(() => setOpen(null), []);
  /** The open/close protocol, spelled once: a lens toggles itself and, because
   *  `open` holds a single id, shuts whichever other one was showing. */
  const lens = useCallback(
    (id: string) => ({
      open: open === id,
      onOpen: () => setOpen(open === id ? null : id),
      onClose: close,
    }),
    [open, close],
  );
  // A phone has room for the glyphs and the chevrons and nothing else. The value
  // is still on screen - it is the glyph - and the menu names it in full.
  const terse = layout.mode === 'compact';

  const surfaces: Choice<string>[] = SURFACES.map((token) => ({
    value: token,
    label: SURFACE_LABEL[token] ?? token,
    swatch: colors[token],
  }));
  return (
    // `z` above the canvas: an open menu hangs off the bar and over the stage, and
    // a stacking order left to document position would put the stage on top of it.
    <Box z={30} style={RULE}>
      {/* The click-catcher, sized to the canvas column and the window's height
          from the numbers the layout already knows. It is drawn under the bar and
          over everything else, carries no fill (dimming the page for a two-item
          picker would be theatre), and is a `Focusable` so a remote can dismiss a
          menu as well as a pointer. It lives out here rather than inside the menu
          because a scrim positioned off a 90pt trigger cannot cover a window. */}
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
        {/* Rotation belongs to the frame, so it sits against the frame's own
            trigger with no rule between them - and it is ABSENT, not disabled,
            on `fit` and on the television: a control that cannot do anything is
            a question the toolbar should not be asking. */}
        {canRotate(viewport) ? (
          <IconTool
            // The glyph is what pressing it GIVES you, the way the full-screen
            // button shows the arrows that come back in. The fill is what you
            // are currently in.
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
        {/* The host's own lenses, after the canvas's and indistinguishable from
            them: an app's locale switch should not look like a guest. */}
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

        {/* The right-hand group acts on the WINDOW rather than on the component,
          which is why it is ruled off from the lenses and pushed to the far end.
          The rule belongs to the copy button and disappears with it: a shell with
          no clipboard would otherwise show a hairline dividing nothing. */}
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

/**
 * One lens: a trigger that says what is currently in force, and the menu behind
 * it.
 *
 * The panel is absolutely positioned off the trigger rather than portalled, which
 * it can be because the toolbar is the topmost row of its column and nothing
 * clips it. That is also why the toolbar has no horizontal scroller any more: a
 * scroller's overflow would have cut every menu off at the bar.
 */
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
  /** The trigger's glyph where the choices have none of their own. */
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

/** A choice's picture: its own glyph, its colour chip, or the lens's glyph when
 * the choices are words (the languages). */
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

/**
 * The dropped panel, hung off the bottom of its trigger.
 *
 * Escape closes it, which together with the toolbar's scrim and a press on any
 * option covers the three ways anyone actually dismisses a menu. Nothing clips
 * it: the toolbar is the topmost row of its column, which is also why the bar no
 * longer has the horizontal scroller it used to - a scroller's overflow would
 * have cut every one of these off at the hairline.
 */
function Menu({ onClose, children }: Readonly<{ onClose: () => void; children: ReactNode }>) {
  useEscapeKey(onClose);
  return (
    <Box absolute top="100%" left={0} mt={6} minW={186} z={2} style={PANEL} bg="surface2" p={5}>
      {children}
    </Box>
  );
}

/** One row of a menu. The chosen one keeps its tick on the right, where a menu's
 * tick belongs, rather than being the only row with a fill: a filled row and a
 * focused row would then be two washes competing to mean "this one". */
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
      {/* The tick keeps its column whether or not it is drawn, so the sizes down
          the right edge of the menu stay in one line rather than stepping in on
          the chosen row. */}
      <Box w={14} align="center">
        {chosen ? <Icon name="check" size={14} color="accent" /> : null}
      </Box>
    </Focusable>
  );
}

/** A glyph-only tool: the kit's own icon button, in the workbench's chrome
 * language - the small corner, the shared wash, no ring. Fills (the kit's
 * accent-soft toggle fill) when it is a toggle that is currently on. The glyph
 * rides in as a child so it keeps the toolbar's muted idle ink. */
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

/**
 * Copies the address of what is on screen.
 *
 * The shell already keeps the URL in step with the story and the view, so this
 * is the last mile of that: the state you are looking at, in someone else's
 * review comment. Absent where there is no clipboard - a disabled affordance on
 * a television is worse than no affordance at all, which is the rule the code
 * block's own copy button follows.
 */
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

// Three states, indexed - the repo forbids nested ternaries, and a refused
// clipboard write has to be visible rather than looking like a dead button.
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

/** The hairline between two groups of tools. */
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
// An open trigger is the top half of the panel hanging off it, so it takes the
// panel's own fill and edge rather than a highlight of its own.
const TRIGGER_OPEN = {
  backgroundColor: colors.surface2,
  borderColor: colors.borderStrong,
} as const;
const TRIGGER_INK = { fontSize: 12.5, fontWeight: '600' } as const;
/** The icon tools' square: a 16pt glyph in the box the old padded shape came to,
 * so the bar's rhythm is unchanged by the move to the kit's `IconButton`. */
const TOOL_BOX = 32;
// Down the window and across the canvas column, and no further: `right: 0` keeps
// it inside a column the page must never be able to scroll sideways past.
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
