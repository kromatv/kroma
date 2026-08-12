// The toolbar's own vocabulary: a lens - the trigger that says what is currently
// in force, and the menu of what else it could be, nine flat buttons having
// become three of these - and the plain buttons that sit beside it.

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
} from '@kroma/ui/kit';
import type { ColorToken } from '@kroma/ui/tokens';
import type { ReactNode } from 'react';
import { useEscapeKey } from './command';

/** One value a lens can take. `swatch` draws the value itself where that says
 * more than a glyph would - a theme's accent, a surface's colour. */
interface Choice<T extends string> {
  value: T;
  label: string;
  glyph?: IconName;
  swatch?: ColorValue;
  note?: string;
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

const s = styles({
  panel: { border: 'borderStrong', radius: 'md', shadow: 'pop' },
  itemNote: { fontSize: 11 },
});

/** A plain toolbar button: one glyph, its accessible name, and whether what it
 * turns on is currently on. `ink` overrides the colour that would say so, for a
 * button whose glyph is itself the answer (a copy that succeeded, or failed). */
function IconTool({
  glyph,
  label,
  active = false,
  ink,
  onPress,
}: Readonly<{
  glyph: IconName;
  label: string;
  active?: boolean;
  ink?: ColorToken;
  onPress: () => void;
}>) {
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
      <Icon name={glyph} size={16} color={ink ?? (active ? 'accent' : 'textMuted')} />
    </IconButton>
  );
}

function Sep() {
  return <Box w={1} h={18} mx={5} bg="border" />;
}

const TOOL_BOX = 32;

export type { Choice };
export { IconTool, Lens, Sep };
