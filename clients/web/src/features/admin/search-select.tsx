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
  entryDefaultSize,
  Focusable,
  Icon,
  selectTriggerVariants,
  Text,
  useAnchoredPlacement,
} from '@kroma/ui/kit';
import { IconCheck, IconSearch } from '@tabler/icons-react';
import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { StyleProp, View, ViewStyle } from 'react-native';

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
        className="fixed inset-0 z-50 cursor-default"
      />
      <div
        className="fixed z-50 min-w-60 overflow-hidden rounded-md border border-border-strong bg-surface-1 shadow-pop"
        style={{ left: at.left, top: at.top, bottom: at.bottom, width: at.width }}
      >
        {/* The popup itself is the box, so this row takes no field ring (see styles.css). */}
        <div
          data-focus-ring="off"
          className="flex items-center gap-2 border-b border-border px-3 py-2.5"
        >
          <IconSearch size={14} className="shrink-0 text-dim" />
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
            className="w-full bg-transparent text-[13px] font-medium text-text outline-none placeholder:text-dim"
          />
        </div>
        <div ref={list} id={listId} role="listbox" className="max-h-64 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12.5px] text-dim">-</div>
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
                className={`relative flex w-full cursor-pointer select-none items-center rounded-[4px] py-2 pl-3 pr-8 text-left text-[13px] font-medium outline-none ${i === active ? 'bg-white/6' : ''} ${o === value ? 'text-accent' : 'text-text'}`}
              >
                {o}
                {o === value ? (
                  <IconCheck size={14} stroke={2.4} className="absolute right-2.5" />
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
