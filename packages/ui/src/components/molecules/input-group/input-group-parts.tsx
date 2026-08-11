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
import { styles } from '#ui/core';
import { nestedRadius } from '#ui/core/tokens';
import { controlRadius } from '#ui/lib/field-shell';
import {
  type AddonAlign,
  AddonContext,
  INSET,
  useAddonSlot,
  useInputGroup,
} from './input-group-context';

/** The entry, stripped of the shell it usually draws: that belongs to Root. */
function GroupInput(props: Readonly<Omit<TextFieldProps, 'size'>>) {
  const group = useInputGroup('Input');
  const entry = useRef<TextInput>(null);
  const { size, registerFocus, onFocusChange, padStart, padEnd, invalid } = group;
  const focus = useCallback(() => entry.current?.focus(), []);
  useEffect(() => registerFocus(focus), [registerFocus, focus]);
  return (
    <TextField
      size={size}
      flex={1}
      minW={0}
      flat
      pl={padStart}
      pr={padEnd}
      invalid={invalid}
      {...props}
      entryRef={entry}
      onFocus={() => {
        onFocusChange(true);
        props.onFocus?.();
      }}
      onBlur={() => {
        onFocusChange(false);
        props.onBlur?.();
      }}
    />
  );
}

/** The multi-line entry, and the one the block addons are for. */
function GroupTextarea(props: Readonly<Omit<TextAreaProps, 'size'>>) {
  const { size, onFocusChange, padStart, padEnd, invalid } = useInputGroup('Textarea');
  return (
    <TextArea
      size={size}
      flex={1}
      minW={0}
      flat
      pl={padStart}
      pr={padEnd}
      invalid={invalid}
      {...props}
      onFocus={() => {
        onFocusChange(true);
        props.onFocus?.();
      }}
      onBlur={() => {
        onFocusChange(false);
        props.onBlur?.();
      }}
    />
  );
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
  const body = (
    <Box
      row
      align="center"
      gap={8}
      // py, not px, against the shell's edge: an addon holds glyphs and chips,
      // which sit as far from their edge as from the top and bottom, matching
      // <TextField>'s own icon well.
      pl={align === 'inline-end' ? 0 : metrics.py}
      pr={align === 'inline-start' ? 0 : metrics.py}
      py={block ? INSET : 0}
      minH={block ? metrics.height : undefined}
      style={[
        block ? s.blockAddon : null,
        divider && align === 'block-start' ? s.ruleBelow : null,
        divider && align === 'block-end' ? s.ruleAbove : null,
        style,
      ]}
    >
      {slotted}
    </Box>
  );
  if (block) return body;
  return (
    <Pressable
      onPress={() => {
        onPress?.();
        focusControl();
      }}
    >
      {body}
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
      size={at.box}
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
