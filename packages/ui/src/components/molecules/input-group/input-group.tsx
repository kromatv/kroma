// <InputGroup>: an entry with things welded into its shell. Yoga has no
// `order` and there are no `:has()` selectors, so the Root sorts its children
// into buckets once and publishes what it learned through context.

import {
  Children,
  isValidElement,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { type ControlSize, controlMetrics, edgeColor, fieldRing } from '#ui/lib/field-shell';
import { Context, type InputGroupContext } from './input-group-context';
import {
  Addon,
  GroupButton,
  GroupIconButton,
  GroupInput,
  GroupText,
  GroupTextarea,
} from './input-group-parts';

interface InputGroupRootProps {
  /** Names the whole control to assistive tech: the entry plus its addons is
   *  one thing to a reader, whatever it is made of. */
  label: string;
  /** The control shell's size; see <TextField>. */
  size?: ControlSize;
  invalid?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

interface Buckets {
  blockStart: ReactNode[];
  inlineStart: ReactNode[];
  control: ReactNode[];
  inlineEnd: ReactNode[];
  blockEnd: ReactNode[];
}

function sort(children: ReactNode): Buckets {
  const at: Buckets = {
    blockStart: [],
    inlineStart: [],
    control: [],
    inlineEnd: [],
    blockEnd: [],
  };
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child) || child.type !== Addon) {
      at.control.push(child);
      continue;
    }
    const align = (child.props as { align?: string }).align ?? 'inline-start';
    if (align === 'block-start') at.blockStart.push(child);
    else if (align === 'block-end') at.blockEnd.push(child);
    else if (align === 'inline-end') at.inlineEnd.push(child);
    else at.inlineStart.push(child);
  }
  return at;
}

function Root({ label, size, invalid = false, style, children }: Readonly<InputGroupRootProps>) {
  const metrics = controlMetrics(size);
  const [focused, setFocused] = useState(false);
  const control = useRef<() => void>(() => {});

  const at = useMemo(() => sort(children), [children]);
  const stacked = at.blockStart.length > 0 || at.blockEnd.length > 0;

  const registerFocus = useCallback((focus: () => void) => {
    control.current = focus;
  }, []);
  const focusControl = useCallback(() => control.current(), []);

  const ctx = useMemo<InputGroupContext>(
    () => ({
      size,
      metrics,
      invalid,
      padStart: at.inlineStart.length > 0 ? 0 : metrics.px,
      padEnd: at.inlineEnd.length > 0 ? 0 : metrics.px,
      onFocusChange: setFocused,
      registerFocus,
      focusControl,
    }),
    [
      size,
      metrics,
      invalid,
      at.inlineStart.length,
      at.inlineEnd.length,
      registerFocus,
      focusControl,
    ],
  );

  const row = (
    <Box row align="center" gap={metrics.gap} minH={metrics.height - 2} minW={0}>
      {at.inlineStart}
      {at.control}
      {at.inlineEnd}
    </Box>
  );

  return (
    <Context.Provider value={ctx}>
      <Box
        role="group"
        accessibilityLabel={label}
        radius={metrics.radius}
        bg={metrics.bg}
        borderWidth={1}
        minW={0}
        style={[{ borderColor: edgeColor(focused, invalid) }, focused ? fieldRing() : null, style]}
      >
        {stacked ? (
          <>
            {at.blockStart}
            {row}
            {at.blockEnd}
          </>
        ) : (
          row
        )}
      </Box>
    </Context.Provider>
  );
}

/**
 * An entry and its addons as one control.
 *
 * ```tsx
 * <InputGroup.Root label="Search">
 *   <InputGroup.Addon><Icon name="search" size={18} /></InputGroup.Addon>
 *   <InputGroup.Input placeholder="Search" />
 *   <InputGroup.Addon align="inline-end"><Kbd>K</Kbd></InputGroup.Addon>
 * </InputGroup.Root>
 * ```
 */
const InputGroup = {
  Root,
  Input: GroupInput,
  Textarea: GroupTextarea,
  Addon,
  Button: GroupButton,
  IconButton: GroupIconButton,
  Text: GroupText,
};

export type { InputGroupRootProps };
export { InputGroup };
