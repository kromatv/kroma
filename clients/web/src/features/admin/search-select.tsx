// A searchable select for long lists (the model picker on the IA page).
// Renders as the design's chevron value-chip; opening reveals a sticky search
// box that filters the options (model lists from Ollama/OpenRouter get long).
// The current value is always selectable even if it isn't in the loaded list.
//
// The W3C combobox pattern by hand: the search input is the combobox, the
// filtered list is a listbox it controls through aria-activedescendant, and
// arrows/Enter/Escape drive it while typing filters.

import { useT } from '@kroma/ui';
import {
  armEscapeGuard,
  Box,
  color,
  Divider,
  entryDefaultSize,
  Focusable,
  Icon,
  Row,
  selectTriggerVariants,
  Text,
  useAnchoredPlacement,
  useTheme,
} from '@kroma/ui/kit';
import {
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { StyleProp, View, ViewStyle } from 'react-native';

// A popup is `position: fixed` and its list scrolls on one axis, neither of
// which React Native has, so the panel stays real CSS. Every value in it still
// comes from a token.
const BACKDROP: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  margin: 0,
  padding: 0,
  border: 0,
  background: 'none',
  cursor: 'default',
};

const LIST: CSSProperties = { maxHeight: 256, overflowY: 'auto', padding: 6 };

const OPTION: CSSProperties = {
  position: 'relative',
  display: 'flex',
  width: '100%',
  alignItems: 'center',
  margin: 0,
  padding: '8px 32px 8px 12px',
  border: 0,
  borderRadius: 4,
  textAlign: 'left',
  cursor: 'pointer',
  outline: 'none',
  userSelect: 'none',
};

const FOCUS_RING_OFF = { focusRing: 'off' } as const;

export function SearchSelect({
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder,
  style,
}: Readonly<{
  value: string;
  options: string[];
  onChange?: (v: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  style?: StyleProp<ViewStyle>;
}>) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<View>(null);
  const label = value || placeholder || '';

  const close = () => {
    setOpen(false);
    // react-native-web hands back the DOM node, which is what takes the focus.
    (trigger.current as unknown as HTMLElement | null)?.focus?.();
  };

  return (
    <>
      <Focusable
        ref={trigger}
        role="combobox"
        expanded={open}
        label={label}
        onPress={() => setOpen(true)}
        sv={selectTriggerVariants}
        vars={{ size: entryDefaultSize(), filled: value !== '' }}
        style={style}
      >
        {(state) => (
          <>
            <Text variant="body" lines={1} style={state.slots.ink}>
              {label}
            </Text>
            <Box flex />
            <Icon name="chevron-down" size={16} color="textDim" />
          </>
        )}
      </Focusable>
      {open ? (
        <SearchPanel
          anchor={trigger}
          value={value}
          options={options}
          searchPlaceholder={searchPlaceholder}
          onPick={(v) => {
            onChange?.(v);
            close();
          }}
          onClose={close}
        />
      ) : null}
    </>
  );
}

function SearchPanel({
  anchor,
  value,
  options,
  searchPlaceholder,
  onPick,
  onClose,
}: Readonly<{
  anchor: RefObject<View | null>;
  value: string;
  options: string[];
  searchPlaceholder?: string;
  onPick: (v: string) => void;
  onClose: () => void;
}>) {
  const listId = useId();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const t = useT();
  const at = useAnchoredPlacement(anchor, { minWidth: 240, matchWidth: true, maxHeight: 320 });
  const theme = useTheme();
  const panel: CSSProperties = {
    position: 'fixed',
    zIndex: 50,
    minWidth: 240,
    overflow: 'hidden',
    borderRadius: theme.radius.xs,
    border: `1px solid ${theme.colors.borderStrong}`,
    background: theme.colors.surface1,
    boxShadow: theme.shadow.pop,
  };
  // The role carries the face and the size; only the reset around it is stated.
  const entry: CSSProperties = {
    ...(theme.type.meta as CSSProperties),
    width: '100%',
    margin: 0,
    padding: 0,
    border: 0,
    background: 'transparent',
    color: theme.colors.text,
    outline: 'none',
  };

  // Keep the current value selectable even if it's not in the loaded list.
  const all = useMemo(
    () => (value && !options.includes(value) ? [value, ...options] : options),
    [value, options],
  );
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((o) => o.toLowerCase().includes(needle)) : all;
  }, [q, all]);

  useEffect(() => {
    input.current?.focus();
  }, []);

  // Typing refilters; the highlight goes back to the top of the new list.
  // biome-ignore lint/correctness/useExhaustiveDependencies: q is an intentional re-run key, not something the effect reads
  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    const rowId = CSS.escape(`${listId}-${active}`);
    list.current?.querySelector(`[id="${rowId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = filtered[active];
      if (hit) onPick(hit);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      if (e.key === 'Escape') armEscapeGuard();
      onClose();
    }
  };

  if (!at) return null;

  return (
    <>
      {/* The world behind the panel: one press anywhere out there closes it. */}
      <button
        type="button"
        aria-label={t('common.close')}
        tabIndex={-1}
        onClick={onClose}
        style={BACKDROP}
      />
      <div
        style={{
          ...panel,
          left: at.left,
          top: at.top,
          bottom: at.bottom,
          width: at.width,
        }}
      >
        {/* The popup itself is the box, so this row takes no field ring (see styles.css). */}
        <Row gap={8} px={12} py={10} dataSet={FOCUS_RING_OFF}>
          <Icon name="search" size={14} color="textDim" />
          <input
            ref={input}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={filtered.length ? `${listId}-${active}` : undefined}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder}
            data-focus-ring="off"
            style={entry}
          />
        </Row>
        <Divider />
        <div ref={list} id={listId} role="listbox" style={LIST}>
          {filtered.length === 0 ? (
            <Text variant="meta" color="textDim" textAlign="center" px={12} py={16}>
              -
            </Text>
          ) : (
            filtered.map((o, i) => (
              // A real button, not a div: the row is a pointer target, and the
              // keyboard reaches it through the combobox input above rather than
              // by focus, so `tabIndex={-1}` keeps it out of the tab ring while
              // the element stays interactive for assistive tech.
              <button
                key={o}
                type="button"
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o === value}
                tabIndex={-1}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(o)}
                style={{
                  ...OPTION,
                  background: i === active ? color('tint/6') : 'transparent',
                }}
              >
                <Text variant="meta" color={o === value ? 'accentText' : 'text'}>
                  {o}
                </Text>
                {o === value ? (
                  <Box absolute right={10}>
                    <Icon name="check" size={14} stroke={2.4} color="accentText" />
                  </Box>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
