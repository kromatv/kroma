import {
  Children,
  isValidElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { Pressable, type StyleProp, type TextInput, type ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Button, type ButtonProps } from '#ui/components/atoms/button';
import { IconButton, type IconButtonProps } from '#ui/components/atoms/icon-button';
import { Text } from '#ui/components/atoms/text';
import { TextArea, type TextAreaProps } from '#ui/components/atoms/text-area';
import { TextField, type TextFieldProps } from '#ui/components/atoms/text-field';
import { type BoxStyleProps, boxStyle, styles } from '#ui/core';
import { nestedRadius } from '#ui/core/tokens';
import { controlRadius } from '#ui/lib/field-shell';
import {
  type AddonAlign,
  AddonContext,
  INSET,
  type InputGroupContext,
  useAddonSlot,
  useInputGroup,
} from './input-group-context';

// The shell's metrics, as the defaults the entry draws itself with. Written
// BEFORE the caller's props, so a call site can still override one.
function shellProps(group: InputGroupContext) {
  return {
    size: group.size,
    flex: 1,
    minW: 0,
    flat: true,
    pl: group.padStart,
    pr: group.padEnd,
    invalid: group.invalid,
  } as const;
}

interface EntryOwn {
  label?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}

// The name and the focus reporting the shell owns. Written AFTER the caller's
// props: the shell has to hear every focus, so an entry with its own handler
// gets both rather than replacing this one.
function shellWiring(group: InputGroupContext, own: Readonly<EntryOwn>) {
  return {
    label: own.label ?? group.label,
    onFocus: () => {
      group.onFocusChange(true);
      own.onFocus?.();
    },
    onBlur: () => {
      group.onFocusChange(false);
      own.onBlur?.();
    },
  };
}

/** The entry, stripped of the shell it usually draws: that belongs to Root. */
function GroupInput(props: Readonly<Omit<TextFieldProps, 'size'>>) {
  const group = useInputGroup('Input');
  const { registerFocus } = group;
  const entry = useRef<TextInput>(null);
  const focus = useCallback(() => entry.current?.focus(), []);
  useEffect(() => registerFocus(focus), [registerFocus, focus]);
  return (
    <TextField {...shellProps(group)} {...props} {...shellWiring(group, props)} entryRef={entry} />
  );
}

/** The multi-line entry, and the one the block addons are for. */
function GroupTextarea(props: Readonly<Omit<TextAreaProps, 'size'>>) {
  const group = useInputGroup('Textarea');
  return <TextArea {...shellProps(group)} {...props} {...shellWiring(group, props)} />;
}

interface AddonProps {
  /** Where it sits, not where it is written. */
  align?: AddonAlign;
  /** A hairline between a block addon and the entry. */
  divider?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

// One provider per slot, each memoising its own value: the slot is built inside
// a map, so the value cannot be hoisted to a hook in Addon, and rebuilding it
// every render would re-render every control in the addon for nothing.
function AddonSlotProvider({
  align,
  edge,
  children,
}: Readonly<{ align: AddonAlign; edge: boolean; children: ReactNode }>) {
  const value = useMemo(() => ({ align, edge }), [align, edge]);
  return <AddonContext.Provider value={value}>{children}</AddonContext.Provider>;
}

function Addon({
  align = 'inline-start',
  divider = false,
  onPress,
  style,
  children,
}: Readonly<AddonProps>) {
  const { metrics, focusControl } = useInputGroup('Addon');
  const block = align.startsWith('block');
  const items = Children.toArray(children);
  const edgeAt = edgeIndex(align, items.length);
  const slotted = items.map((child, index) => (
    <AddonSlotProvider key={slotKey(child, index)} align={align} edge={index === edgeAt}>
      {child}
    </AddonSlotProvider>
  ));
  // py, not px, against the shell's edge: an addon holds glyphs and chips, which
  // sit as far from their edge as from the top and bottom, matching
  // <TextField>'s own icon well.
  const shape: BoxStyleProps = {
    row: true,
    align: 'center',
    gap: 8,
    pl: align === 'inline-end' ? 0 : metrics.py,
    pr: align === 'inline-start' ? 0 : metrics.py,
    py: block ? INSET : 0,
    minH: block ? metrics.height : undefined,
  };
  const coats = [
    block ? s.blockAddon : null,
    divider && align === 'block-start' ? s.ruleBelow : null,
    divider && align === 'block-end' ? s.ruleAbove : null,
    style,
  ];
  if (block) {
    return (
      <Box {...shape} style={coats}>
        {slotted}
      </Box>
    );
  }
  // The addon IS the pressable: a press anywhere on it puts the caret in the
  // control, and a box inside it would only be the same rectangle again.
  return (
    <Pressable
      onPress={() => {
        onPress?.();
        focusControl();
      }}
      style={[boxStyle(shape), ...coats]}
    >
      {slotted}
    </Pressable>
  );
}

function edgeIndex(align: AddonAlign, count: number): number {
  if (align === 'inline-start') return 0;
  if (align === 'inline-end') return count - 1;
  return -1;
}

function slotKey(child: ReactNode, index: number): string {
  return isValidElement(child) && child.key !== null ? String(child.key) : `slot-${index}`;
}

/** What a control inside the shell measures: the shell's height minus its
 *  inset, the concentric corner, and the pull-in an inline addon needs. */
function useInShell(part: string): { box: number; radius: number; pull: ViewStyle } {
  const { metrics } = useInputGroup(part);
  const slot = useAddonSlot();
  return useMemo(() => {
    const by = -(metrics.py - INSET);
    const edge = slot?.edge ? slot.align : null;
    return {
      box: metrics.height - INSET * 2,
      radius: nestedRadius(controlRadius(metrics), INSET),
      pull: {
        ...(edge === 'inline-start' ? { marginLeft: by } : null),
        ...(edge === 'inline-end' ? { marginRight: by } : null),
      },
    };
  }, [metrics, slot]);
}

/** A labelled button that lives inside the shell. */
function GroupButton({ style, ...props }: Readonly<ButtonProps>) {
  const at = useInShell('Button');
  const shape = useMemo<ViewStyle>(
    () => ({
      minHeight: at.box,
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 12,
      paddingRight: 12,
      borderRadius: at.radius,
      ...at.pull,
    }),
    [at],
  );
  return <Button variant="ghost" size="sm" {...props} style={[shape, style]} />;
}

/** The icon-only one: its `label` is the accessible name, not visible text. */
function GroupIconButton({ style, ...props }: Readonly<IconButtonProps>) {
  const at = useInShell('IconButton');
  return (
    <IconButton
      variant="ghost"
      diameter={at.box}
      radius={at.radius}
      {...props}
      style={[at.pull, style]}
    />
  );
}

/** Unit text inside an addon. */
function GroupText({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Text variant="meta" color="textDim">
      {children}
    </Text>
  );
}

const s = styles({
  blockAddon: { w: '100%' },
  ruleBelow: { border: 'border', borderWidth: 0, borderBottomWidth: 1 },
  ruleAbove: { border: 'border', borderWidth: 0, borderTopWidth: 1 },
});

export type { AddonProps };
export { Addon, GroupButton, GroupIconButton, GroupInput, GroupText, GroupTextarea };
