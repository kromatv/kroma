import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, type LayoutChangeEvent, type View } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { styles, useStyles } from '#ui/core';
import { type ControlSize, useEntryDefaults } from '#ui/lib/field-shell';
import { FocusRegion } from '#ui/lib/focus-scope';
import { WEB } from '#ui/lib/platform';
import { useFadeRise } from '#ui/lib/use-fade-rise';
import { Actions } from './selection-bar-actions';
import { Announce } from './selection-bar-announce';
import { SelectionBarContext, type SelectionBarState } from './selection-bar-context';
import { useSelectionKeys } from './selection-bar-keys';
import { Clear, Item, SelectAll, Status } from './selection-bar-parts';

type SelectionBarPlacement = 'floating' | 'inline';

const COMPACT_BELOW = 600;

interface SelectionBarRootProps {
  /** At 0 the bar leaves with its exit motion, still showing the last count. */
  count: number;
  /** Called by <SelectionBar.Clear> and by Escape. */
  onClear: () => void;
  label: string;
  /** Defaults to `floating`: raised, centred, and sticky at the viewport's foot on the web. */
  placement?: SelectionBarPlacement;
  /** The shell every control on the bar stands at; defaults to the app's (`setEntryDefaults`). */
  size?: ControlSize;
  /** A direct Clear leads the bar and a direct Actions ends it; a direct Status is announced. */
  children: ReactNode;
}

interface Sorted {
  clear: ReactNode[];
  middle: ReactNode[];
  actions: ReactNode[];
  status: string;
}

function spoken(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(spoken).join('');
  if (!isValidElement(node)) return '';
  return spoken((node.props as { children?: ReactNode }).children);
}

function sort(children: ReactNode): Sorted {
  const at: Sorted = { clear: [], middle: [], actions: [], status: '' };
  for (const child of Children.toArray(children)) {
    const part = isValidElement(child) ? child.type : null;
    if (part === Clear) at.clear.push(child);
    else if (part === Actions) at.actions.push(child);
    else at.middle.push(child);
    if (part === Status) at.status = spoken(child as ReactElement);
  }
  return at;
}

interface Held {
  count: number;
  children: ReactNode;
}

function Root({
  count,
  onClear,
  label,
  placement = 'floating',
  size,
  children,
}: Readonly<SelectionBarRootProps>) {
  const s = useStyles(sDefinition);
  const dock = WEB ? s.dockWeb : s.dockNative;
  const defaults = useEntryDefaults();
  const shell = size ?? defaults.size;
  const shown = count > 0;
  const fade = useFadeRise(shown);
  const bar = useRef<View>(null);
  const [width, setWidth] = useState(0);
  const [held, setHeld] = useState<Held>({ count, children });
  if (shown && held.count !== count) setHeld({ count, children });
  const drawn = shown ? children : held.children;

  useSelectionKeys(shown, bar, onClear);

  const compact = width > 0 && width < COMPACT_BELOW;
  const context = useMemo<SelectionBarState>(
    () => ({ size: shell, compact, onClear }),
    [shell, compact, onClear],
  );
  const at = sort(drawn);
  const floating = placement === 'floating';

  const measure = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <SelectionBarContext.Provider value={context}>
      <Announce text={shown ? at.status : ''} />
      {fade.mounted ? (
        <Box
          onLayout={measure}
          pointerEvents={shown ? 'box-none' : 'none'}
          style={floating ? dock : s.inline}
        >
          <Animated.View style={fade.style}>
            <FocusRegion>
              <Box
                ref={bar}
                role="group"
                accessibilityLabel={label}
                style={[s.bar, floating ? s.raised : null]}
              >
                {at.clear}
                <Box style={compact ? s.stacked : s.middle}>{at.middle}</Box>
                {at.actions}
              </Box>
            </FocusRegion>
          </Animated.View>
        </Box>
      ) : null}
    </SelectionBarContext.Provider>
  );
}

const sDefinition = styles({
  dockWeb: {
    position: 'sticky',
    bottom: 0,
    z: 70,
    align: 'center',
    pt: 12,
    paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
  },
  dockNative: { align: 'center', pt: 12, pb: 16 },
  inline: { self: 'stretch' },
  bar: {
    row: true,
    wrap: true,
    align: 'center',
    gapX: 8,
    gapY: 4,
    p: 8,
    maxW: '100%',
    radius: 'xl',
    bg: 'surface2',
    border: 'borderStrong',
  },
  raised: { shadow: 'pop' },
  middle: { row: true, align: 'center', gap: 4, shrink: 1, minW: 0, pr: 8 },
  stacked: { shrink: 1, minW: 0, pr: 8 },
});

/**
 * The bar that appears while rows are selected: how many, a way to widen the
 * selection to the whole set, what can be done to it, and a way to drop it.
 *
 * ```tsx
 * <SelectionBar.Root count={picked.size} onClear={clear} label="Sélection">
 *   <SelectionBar.Clear label="Tout désélectionner" />
 *   <SelectionBar.Status>4 titres sélectionnés</SelectionBar.Status>
 *   <SelectionBar.SelectAll label="Sélectionner les 1 170 titres" onPress={selectAll} />
 *   <SelectionBar.Actions label="Autres actions">
 *     <SelectionBar.Item icon="radar" tone="accent" label="Suivre" onPress={follow} />
 *     <SelectionBar.Item icon="radar-off" tone="danger" label="Ne plus suivre" onPress={drop} />
 *   </SelectionBar.Actions>
 * </SelectionBar.Root>
 * ```
 */
const SelectionBar = { Root, Clear, Status, SelectAll, Actions, Item };

export type { SelectionBarActionsProps } from './selection-bar-actions';
export type {
  SelectionBarItemProps,
  SelectionBarSelectAllProps,
  SelectionBarTone,
} from './selection-bar-parts';
export type { SelectionBarPlacement, SelectionBarRootProps };
export { SelectionBar };
