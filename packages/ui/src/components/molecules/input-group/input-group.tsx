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
   *  one thing to a reader, whatever it is made of. The entry wears it too,
   *  unless it names itself: that is where focus lands. */
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

// An addon's own `align`, as the bucket it lands in. Anything unnamed sits on
// the control's row, which is where <Addon> itself defaults.
const BUCKET: Record<string, keyof Buckets> = {
  'block-start': 'blockStart',
  'block-end': 'blockEnd',
  'inline-start': 'inlineStart',
  'inline-end': 'inlineEnd',
};

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
    at[BUCKET[align] ?? 'inlineStart'].push(child);
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
      label,
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
      label,
      size,
      metrics,
      invalid,
      at.inlineStart.length,
      at.inlineEnd.length,
      registerFocus,
      focusControl,
    ],
  );

  const inline = [at.inlineStart, at.control, at.inlineEnd];
  // The inline run's own metrics, which the shell wears itself unless something
  // is stacked above or below it - then, and only then, the run needs a row of
  // its own inside the shell.
  const run = { row: true, align: 'center', gap: metrics.gap, minH: metrics.height - 2 } as const;

  return (
    <Context.Provider value={ctx}>
      <Box
        role="group"
        accessibilityLabel={label}
        radius={metrics.radius}
        bg={metrics.bg}
        borderWidth={1}
        minW={0}
        {...(stacked ? null : run)}
        style={[{ borderColor: edgeColor(focused, invalid) }, focused ? fieldRing() : null, style]}
      >
        {stacked ? (
          <>
            {at.blockStart}
            <Box {...run} minW={0}>
              {inline}
            </Box>
            {at.blockEnd}
          </>
        ) : (
          inline
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
