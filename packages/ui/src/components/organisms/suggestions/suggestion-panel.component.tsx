import { type ReactNode, type RefObject, useId, useMemo, useRef } from 'react';
import { TextInput, type View } from 'react-native';
import { activeTheme, color, sharedStyle, useStyleScope } from '#ui/core';
import { useRowInView } from '#ui/lib/anchored-keys.hook';
import { focusTrigger, useAnchoredPlacement } from '#ui/lib/anchored-panel';
import { AnchoredPopup, LISTBOX } from '#ui/lib/anchored-popup.component';
import { NO_OUTLINE, PLACEHOLDER } from '#ui/lib/field-shell';
import { useFocusVisible } from '#ui/lib/focus-visible.hook';
import { useFocusWithin } from '#ui/lib/focus-within.hook';
import type { EntryMetrics } from './entry-metrics';
import { EntryWell } from './entry-well.component';
import { SuggestionRowContext, type SuggestionRowState } from './suggestion-context';
import { type EntryKey, type SuggestionKeys, useSuggestionKeys } from './suggestion-keys.hook';
import { LoadingRow } from './suggestion-row.component';
import {
  commitRow,
  listDrawn,
  rowsOf,
  saysEmpty,
  type SuggestionSurface,
} from './suggestion-surface';
import type { Suggestion } from './suggestions-of';

const ENTRY_MIN_WIDTH = 80;
const PLACEMENT = { minWidth: 200, matchWidth: true, maxHeight: 320 };

function useEntryInk(metrics: EntryMetrics) {
  const scope = useStyleScope();
  const { fontSize, line } = metrics.control;
  return sharedStyle(
    `suggestion:entry:${metrics.mark}:${fontSize}:${line}`,
    { flex: 1, minW: ENTRY_MIN_WIDTH, h: metrics.mark, fontSize, lineHeight: line, color: 'text' },
    scope,
  );
}

interface PanelAt {
  surface: SuggestionSurface;
  listId: string;
  drawn: boolean;
  keys: SuggestionKeys;
}

interface EntryProps {
  at: PanelAt;
  placeholder: string | undefined;
  entryRef: RefObject<TextInput | null>;
  within: ReturnType<typeof useFocusWithin>;
}

function activeRowId({ drawn, keys, listId }: PanelAt): string | undefined {
  return drawn && keys.active >= 0 ? `${listId}-${keys.active}` : undefined;
}

function Entry({ at, placeholder, entryRef, within }: Readonly<EntryProps>) {
  const theme = activeTheme(useStyleScope().theme);
  const { surface, keys } = at;
  return (
    <TextInput
      ref={entryRef}
      role="combobox"
      aria-expanded={at.drawn}
      aria-controls={at.listId}
      aria-activedescendant={activeRowId(at)}
      accessibilityLabel={surface.look.label}
      value={surface.entry.text}
      onChangeText={surface.entry.onText}
      onKeyPress={keys.onKeyPress}
      onSubmitEditing={() => keys.commit(keys.active)}
      onFocus={within.onFocus}
      onBlur={within.onBlur}
      editable={!surface.look.disabled}
      placeholder={placeholder}
      placeholderTextColor={color(PLACEHOLDER, theme)}
      selectionColor={theme.colors.accent}
      autoCorrect={false}
      autoCapitalize="none"
      spellCheck={false}
      style={[NO_OUTLINE, useEntryInk(surface.metrics)]}
    />
  );
}

interface RowHostProps {
  row: Suggestion;
  index: number;
  at: PanelAt;
  keyed: boolean;
  entryRef: RefObject<TextInput | null>;
  onRowLayout: (index: number, y: number, height: number) => void;
}

function RowHost({ row, index, at, keyed, entryRef, onRowLayout }: Readonly<RowHostProps>) {
  const active = index === at.keys.active;
  const { setActive } = at.keys;
  const nativeID = `${at.listId}-${index}`;
  const state = useMemo<SuggestionRowState>(
    () => ({
      nativeID,
      active,
      keyed,
      onHoverIn: () => setActive(index),
      onPicked: () => focusTrigger(entryRef),
      onLayout: (y, height) => onRowLayout(index, y, height),
    }),
    [nativeID, index, active, keyed, setActive, entryRef, onRowLayout],
  );
  return <SuggestionRowContext value={state}>{row.node}</SuggestionRowContext>;
}

interface PopupProps {
  at: PanelAt;
  rows: readonly Suggestion[];
  wellRef: RefObject<View | null>;
  entryRef: RefObject<TextInput | null>;
}

function Popup({ at, rows, wellRef, entryRef }: Readonly<PopupProps>) {
  const { surface, keys, listId } = at;
  const keyed = useFocusVisible(keys.active);
  const { scroll, onRowLayout } = useRowInView(keys.active);
  const placement = useAnchoredPlacement(wellRef, PLACEMENT);
  if (!placement) {
    return null;
  }
  return (
    <AnchoredPopup
      at={placement}
      role={LISTBOX}
      label={surface.look.label}
      listId={listId}
      within={wellRef}
      onDismiss={() => surface.entry.setOpen(false, 'outside')}
      scroll={scroll}
    >
      {surface.list.loading ? <LoadingRow /> : null}
      {saysEmpty(surface) ? surface.list.empty : null}
      {rows.map((row, index) => (
        <RowHost key={row.key} {...{ row, index, at, keyed, entryRef, onRowLayout }} />
      ))}
    </AnchoredPopup>
  );
}

interface SuggestionPanelProps {
  surface: SuggestionSurface;
  lead: ReactNode;
  filled: boolean;
  single?: boolean;
  keys?: Readonly<Record<string, EntryKey>>;
}

interface WellProps extends Omit<SuggestionPanelProps, 'surface' | 'keys'> {
  at: PanelAt;
  wellRef: RefObject<View | null>;
  entryRef: RefObject<TextInput | null>;
}

function PanelWell({ at, lead, filled, single, wellRef, entryRef }: Readonly<WellProps>) {
  const { surface } = at;
  const { look } = surface;
  const within = useFocusWithin(
    () => look.onFocusChange(true),
    () => look.onFocusChange(false),
  );
  return (
    <EntryWell
      {...{ metrics: surface.metrics, filled, single, invalid: look.invalid, wellRef }}
      focused={within.focused}
      onPress={() => entryRef.current?.focus()}
    >
      {lead}
      <Entry
        at={at}
        placeholder={filled ? undefined : look.placeholder}
        {...{ entryRef, within }}
      />
    </EntryWell>
  );
}

/** The pointer's presentation: a text entry after `lead` (tags, a face) in
 *  the well, and the suggestions in a list anchored under it, driven from the
 *  entry. `filled` says `lead` draws a mark, and the placeholder shows only
 *  while it does not. */
function SuggestionPanel({ surface, keys, ...well }: Readonly<SuggestionPanelProps>) {
  const listId = `${useId()}-list`;
  const wellRef = useRef<View>(null);
  const entryRef = useRef<TextInput>(null);
  const rows = rowsOf(surface);
  const drawn = listDrawn(surface);
  const commit = (index: number) =>
    commitRow(surface, rows[index] ?? surface.list.suggested.exact ?? surface.list.trailing);
  const panelKeys = useSuggestionKeys({
    query: surface.entry.text,
    setOpen: surface.entry.setOpen,
    rows,
    drawn,
    commit,
    keys,
  });
  const at = { surface, listId, drawn, keys: panelKeys };
  return (
    <>
      <PanelWell at={at} {...well} wellRef={wellRef} entryRef={entryRef} />
      {drawn ? <Popup at={at} rows={rows} wellRef={wellRef} entryRef={entryRef} /> : null}
    </>
  );
}

export { SuggestionPanel };
