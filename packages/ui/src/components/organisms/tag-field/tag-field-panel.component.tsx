import { type ReactElement, type ReactNode, type RefObject, useId, useMemo, useRef } from 'react';
import { TextInput, type View } from 'react-native';
import { activeTheme, color, sharedStyle, useStyleScope } from '#ui/core';
import { useRowInView } from '#ui/lib/anchored-keys.hook';
import { focusTrigger, useAnchoredPlacement } from '#ui/lib/anchored-panel';
import { AnchoredPopup, LISTBOX } from '#ui/lib/anchored-popup.component';
import { NO_OUTLINE, PLACEHOLDER } from '#ui/lib/field-shell';
import { useFocusVisible } from '#ui/lib/focus-visible.hook';
import { useFocusWithin } from '#ui/lib/focus-within.hook';
import { TagFieldRowContext, type TagFieldRowState } from './tag-field-context';
import { faceOf, FreeRow, LoadingRow, type TagFieldItemProps } from './tag-field-item';
import type { TagMetrics } from './tag-field-metrics';
import { type PanelKeys, usePanelKeys } from './tag-field-panel-keys.hook';
import type { TagFieldSurfaceProps } from './tag-field-surface';
import { TagFieldWell } from './tag-field-well.component';

interface PanelRow {
  key: string;
  name: string;
  face: ReactNode;
  disabled: boolean;
  node: ReactElement;
}

const FREE_KEY = 'tag-field:free';
const ENTRY_MIN_WIDTH = 80;
const PLACEMENT = { minWidth: 200, matchWidth: true, maxHeight: 320 };

function itemRow(item: ReactElement<TagFieldItemProps>): PanelRow {
  return {
    key: item.key ?? item.props.value,
    name: item.props.value,
    face: faceOf(item.props),
    disabled: item.props.disabled === true,
    node: item,
  };
}

function rowsOf({ suggested, freeLabel }: TagFieldSurfaceProps): PanelRow[] {
  const rows = suggested.shown.map(itemRow);
  const { free } = suggested;
  if (free !== null && freeLabel !== null) {
    rows.push({
      key: FREE_KEY,
      name: free,
      face: null,
      disabled: false,
      node: <FreeRow key={FREE_KEY} name={free} label={freeLabel} />,
    });
  }
  return rows;
}

function isDrawn(props: TagFieldSurfaceProps, rows: readonly PanelRow[]): boolean {
  if (!props.control.open || props.full || props.disabled) {
    return false;
  }
  const empty = props.empty !== null && props.control.query.trim() !== '';
  return rows.length > 0 || props.loading || empty;
}

function useCommit(props: TagFieldSurfaceProps, rows: readonly PanelRow[]) {
  return (index: number) => {
    const { exact } = props.suggested;
    const row = rows[index] ?? (exact ? itemRow(exact) : rows.find((at) => at.key === FREE_KEY));
    if (!row || row.disabled) {
      return false;
    }
    props.pick(row.name, row.face);
    return true;
  };
}

function useEntryInk(metrics: TagMetrics) {
  const scope = useStyleScope();
  const { fontSize, line } = metrics.control;
  return sharedStyle(
    `tag-field:entry:${metrics.tag}:${fontSize}:${line}`,
    { flex: 1, minW: ENTRY_MIN_WIDTH, h: metrics.tag, fontSize, lineHeight: line, color: 'text' },
    scope,
  );
}

interface PanelAt {
  surface: TagFieldSurfaceProps;
  listId: string;
  drawn: boolean;
  keys: PanelKeys;
}

interface EntryProps {
  at: PanelAt;
  entryRef: RefObject<TextInput | null>;
  within: ReturnType<typeof useFocusWithin>;
}

function activeRowId({ drawn, keys, listId }: PanelAt): string | undefined {
  return drawn && keys.active >= 0 ? `${listId}-${keys.active}` : undefined;
}

function Entry({ at, entryRef, within }: Readonly<EntryProps>) {
  const theme = activeTheme(useStyleScope().theme);
  const { surface, keys } = at;
  return (
    <TextInput
      ref={entryRef}
      role="combobox"
      aria-expanded={at.drawn}
      aria-controls={at.listId}
      aria-activedescendant={activeRowId(at)}
      accessibilityLabel={surface.label}
      value={surface.control.query}
      onChangeText={surface.control.type}
      onKeyPress={keys.onKeyPress}
      onSubmitEditing={() => keys.commit(keys.active)}
      onFocus={within.onFocus}
      onBlur={within.onBlur}
      editable={!surface.disabled}
      placeholder={surface.tags.length === 0 ? surface.placeholder : undefined}
      placeholderTextColor={color(PLACEHOLDER, theme)}
      selectionColor={theme.colors.accent}
      autoCorrect={false}
      autoCapitalize="none"
      spellCheck={false}
      style={[NO_OUTLINE, useEntryInk(surface.metrics)]}
    />
  );
}

interface WellProps {
  at: PanelAt;
  wellRef: RefObject<View | null>;
  entryRef: RefObject<TextInput | null>;
}

function PanelWell({ at, wellRef, entryRef }: Readonly<WellProps>) {
  const { surface } = at;
  const within = useFocusWithin(
    () => surface.onFocusChange(true),
    () => surface.onFocusChange(false),
  );
  return (
    <TagFieldWell
      metrics={surface.metrics}
      filled={surface.tags.length > 0}
      focused={within.focused}
      invalid={surface.invalid}
      wellRef={wellRef}
      onPress={() => entryRef.current?.focus()}
    >
      {surface.tags}
      <Entry at={at} entryRef={entryRef} within={within} />
    </TagFieldWell>
  );
}

interface RowHostProps {
  row: PanelRow;
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
  const state = useMemo<TagFieldRowState>(
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
  return <TagFieldRowContext value={state}>{row.node}</TagFieldRowContext>;
}

interface PopupProps extends WellProps {
  rows: readonly PanelRow[];
}

function Popup({ at, rows, wellRef, entryRef }: Readonly<PopupProps>) {
  const { surface, keys, listId } = at;
  const keyed = useFocusVisible(keys.active);
  const { scroll, onRowLayout } = useRowInView(keys.active);
  const placement = useAnchoredPlacement(wellRef, PLACEMENT);
  if (!placement) {
    return null;
  }
  const nothing = surface.suggested.shown.length === 0 && !surface.loading;
  return (
    <AnchoredPopup
      at={placement}
      role={LISTBOX}
      label={surface.label}
      listId={listId}
      within={wellRef}
      onDismiss={() => surface.control.setOpen(false, 'outside')}
      scroll={scroll}
    >
      {surface.loading ? <LoadingRow /> : null}
      {nothing ? surface.empty : null}
      {rows.map((row, index) => (
        <RowHost key={row.key} {...{ row, index, at, keyed, entryRef, onRowLayout }} />
      ))}
    </AnchoredPopup>
  );
}

/** The pointer's presentation: a text entry after the tags, and the
 *  suggestions in a list anchored under the well, driven from the entry. */
function TagFieldPanel(props: Readonly<TagFieldSurfaceProps>) {
  const listId = `${useId()}-list`;
  const wellRef = useRef<View>(null);
  const entryRef = useRef<TextInput>(null);
  const rows = rowsOf(props);
  const drawn = isDrawn(props, rows);
  const commit = useCommit(props, rows);
  const keys = usePanelKeys({ control: props.control, rows, drawn, commit });
  const at = { surface: props, listId, drawn, keys };
  return (
    <>
      <PanelWell at={at} wellRef={wellRef} entryRef={entryRef} />
      {drawn ? <Popup at={at} rows={rows} wellRef={wellRef} entryRef={entryRef} /> : null}
    </>
  );
}

export { TagFieldPanel };
