// Playback-language picker sheet: searches across ~200 languages in a
// virtualized list. Sized to a fixed screen share, not to content —
// @gorhom/bottom-sheet's dynamic sizing measures only the header, so the list
// would draw over the search field otherwise.

import {
  BottomSheetFlatList,
  type BottomSheetFlatListMethods,
  BottomSheetModal,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { LANG_OFF, langOptions, offeredLang } from '@kroma/core';
import { Icon } from '@kroma/ui/kit';
import { forwardRef, useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetTitle, sheetChrome } from '#mobile/components/ui';
import { useI18n, useT } from '#mobile/lib/i18n';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

// Must equal every row's actual rendered height: `getItemLayout` assumes a
// constant row height and scrolls to the wrong place otherwise.
const ROW_HEIGHT = 52;

const SNAP_POINTS = ['85%'];

export type LangPickerRef = BottomSheetModal;

interface LangPickerSheetProps {
  title: string;
  value?: string | null;
  offerOff?: boolean;
  onPick: (code: string | null) => void;
}

interface Row {
  value: string | null;
  label: string;
  code?: string;
  sentinel?: boolean;
  search: string;
}

export const LangPickerSheet = forwardRef<BottomSheetModal, LangPickerSheetProps>(
  function LangPickerSheet({ title, value, offerOff, onPick }, ref) {
    const t = useT();
    const { locale } = useI18n();
    const insets = useSafeAreaInsets();
    const [query, setQuery] = useState('');
    const list = useRef<BottomSheetFlatListMethods>(null);

    const rows = useMemo<Row[]>(() => {
      const languages = langOptions(t, locale).map(({ code, label }) => ({
        value: code as string | null,
        label,
        code,
        search: fold(`${label} ${code}`),
      }));
      const sentinel = (v: string | null, label: string): Row => ({
        value: v,
        label,
        sentinel: true,
        search: fold(label),
      });
      const head = [sentinel(null, t('account.noPreference'))];
      if (offerOff) head.push(sentinel(LANG_OFF, t('player.subtitlesOff')));
      return [...head, ...languages];
    }, [t, locale, offerOff]);

    // Matches the most specific stored value: `fr-CA` ticks "Français (Canada)",
    // not the base "Français" — comparing on the base would lose the variant.
    const current = value && value !== LANG_OFF ? offeredLang(value) : null;
    const isActive = useCallback(
      (row: Row) => {
        if (row.value == null) return !value;
        if (row.value === LANG_OFF) return value === LANG_OFF;
        return row.value === current;
      },
      [value, current],
    );

    const shown = useMemo(() => {
      const q = fold(query.trim());
      if (!q) return rows;
      return rows.filter((row) => row.search.includes(q));
    }, [rows, query]);

    // Scrolls to the current choice on each present, not via
    // `initialScrollIndex` (read once at mount; the sheet stays mounted for the screen's life).
    const onChange = useCallback(
      (index: number) => {
        if (index < 0) return;
        const at = shown.findIndex(isActive);
        if (at > 0) list.current?.scrollToIndex({ index: at, animated: false, viewPosition: 0.5 });
      },
      [shown, isActive],
    );

    return (
      <BottomSheetModal
        ref={ref}
        {...sheetChrome}
        snapPoints={SNAP_POINTS}
        enableDynamicSizing={false}
        onChange={onChange}
        // `extend`, not `interactive`: the search field is at the top, so there
        // is nothing to lift above the keyboard.
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        onDismiss={() => setQuery('')}
      >
        <View style={styles.header}>
          <SheetTitle>{title}</SheetTitle>
          <View style={styles.searchBox}>
            <Icon name="search" size={17} stroke={2} color={colors.textFaint} />
            <BottomSheetTextInput
              value={query}
              // Reset scroll on each keystroke, or a prior scroll offset can
              // land past the end of a newly filtered (shorter) list.
              onChangeText={(next) => {
                setQuery(next);
                list.current?.scrollToOffset({ offset: 0, animated: false });
              }}
              placeholder={t('account.langSearch')}
              placeholderTextColor={colors.textFaint}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              style={styles.searchInput}
            />
            {query ? (
              <Pressable
                onPress={() => {
                  setQuery('');
                  list.current?.scrollToOffset({ offset: 0, animated: false });
                }}
                accessibilityRole="button"
                accessibilityLabel={t('common.clear')}
                hitSlop={10}
              >
                <Icon name="x" size={16} stroke={2.4} color={colors.textFaint} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <BottomSheetFlatList
          ref={list}
          // @gorhom only applies its own flex on Android (ScrollableContainer.android);
          // iOS needs it explicit or the list overflows the sheet.
          style={styles.listBox}
          data={shown}
          keyExtractor={(row) => row.value ?? 'none'}
          getItemLayout={(_, index) => ({
            length: ROW_HEIGHT,
            offset: ROW_HEIGHT * index,
            index,
          })}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.list,
            { paddingBottom: Math.max(insets.bottom, spacing.md) },
          ]}
          renderItem={({ item, index }) => (
            <LangRow
              row={item}
              active={isActive(item)}
              ruled={Boolean(item.sentinel) && !shown[index + 1]?.sentinel}
              onPress={() => onPick(item.value)}
            />
          )}
          ListEmptyComponent={<Text style={styles.empty}>{t('search.noResults')}</Text>}
        />
      </BottomSheetModal>
    );
  },
);

function LangRow({
  row,
  active,
  ruled,
  onPress,
}: Readonly<{ row: Row; active: boolean; ruled: boolean; onPress(): void }>) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.row,
        ruled && styles.ruled,
        pressed && { backgroundColor: colors.surfaceHigh },
      ]}
    >
      <Text numberOfLines={1} style={[styles.rowLabel, active && styles.rowLabelActive]}>
        {row.label}
      </Text>
      {active ? <Icon name="check" size={17} stroke={2.4} color={colors.accent} /> : null}
      {row.code && !active ? <Text style={styles.rowCode}>{row.code.toUpperCase()}</Text> : null}
    </Pressable>
  );
}

// Combining-marks range, not `\p{Diacritic}`: not every Hermes build supports
// unicode property escapes.
function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { ...type.body, flex: 1, color: colors.text, padding: 0 },
  listBox: { flex: 1 },
  list: { paddingHorizontal: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: ROW_HEIGHT,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  // Border must be inset, not additive, or it breaks the fixed ROW_HEIGHT
  // getItemLayout relies on.
  ruled: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowLabel: { ...type.body, color: colors.text, fontWeight: '500', flexShrink: 1 },
  rowLabelActive: { color: colors.accent, fontWeight: '800' },
  rowCode: { ...type.small, color: colors.textFaint, letterSpacing: 0.5 },
  empty: { ...type.caption, textAlign: 'center', paddingVertical: spacing.lg },
});
