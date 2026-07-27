// The playback-language picker: every language there is, in a sheet you can
// search.
//
// It sizes itself to a fixed share of the screen rather than to its content,
// which is the opposite of what a season list or a three-way action sheet wants
// and the only thing that works here: the list is close to two hundred rows, so
// the sheet takes a fixed share of the screen and the list scrolls inside it (a
// virtualised FlatList, not a column of two hundred mounted Pressables).
//
// THAT OPPOSITION IS ALSO THE BUG THIS FILE WAS BORN WITH, so it is written
// down: @gorhom/bottom-sheet defaults `enableDynamicSizing` to TRUE, and a sheet
// that has both `snapPoints` AND dynamic sizing measures itself against its
// <BottomSheetView> - which here was only the header. The sheet came out one
// header tall and the list drew straight over the search field. A sheet with
// snap points and a scrollable in it must turn dynamic sizing OFF and keep its
// header in a plain <View>; <BottomSheetView> is for the sizes-to-content case
// this deliberately is not.
//
// The SEARCH FIELD is what makes the long list a feature rather than a chore. A
// phone already has the keyboard out; typing "sué" or "swe" or plain "sv" beats
// flicking past a hundred and forty names. The match ignores accents on purpose
// - someone reaching for Swedish types "suedois" as often as "suédois", and a
// picker that answers "no results" to that is just wrong. The codes are matched
// too, and shown down the right edge, which is both a scanning aid and how
// anyone finds out they can type "swe": the tag they read off a track list is
// the tag that works.

import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
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
import { useI18n, useT } from '#mobile/lib/i18n';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

/** Fixed so the list can lay itself out without measuring: what lets the jump to
 * a row a hundred and forty down be instant rather than a scroll through
 * everything above it. Every row is exactly this tall - the divider under the
 * sentinels is a border INSIDE the row, not a taller row - because a list with
 * `getItemLayout` and a variable row is a list that scrolls to the wrong place. */
const ROW_HEIGHT = 52;

/** Tall enough that the list reads as a list; short enough to leave the screen
 * behind it visible, which is what says "this is a choice, not a page". */
const SNAP_POINTS = ['85%'];

export type LangPickerRef = BottomSheetModal;

interface LangPickerSheetProps {
  /** Names the choice being made ("Preferred audio language"). */
  title: string;
  /** The stored preference: a language code, `off`, or null for "no preference". */
  value?: string | null;
  /** Offer "keep subtitles off" above the languages. Subtitles only: it is a
   *  real preference there and meaningless for audio. */
  offerOff?: boolean;
  /** `null` clears the preference; `off` is the sentinel; anything else is a code. */
  onPick: (code: string | null) => void;
}

interface Row {
  /** The stored value this row picks. */
  value: string | null;
  label: string;
  /** The ISO code, shown dim down the right edge. Absent on the sentinels,
   *  which are not languages and have nothing to tag. */
  code?: string;
  /** "No preference" / "Off": the rows that answer something other than
   *  "which language", and are ruled off from the ones that do. */
  sentinel?: boolean;
  /** What a search query is matched against, folded once at build time. */
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
        // The code is searchable too: "sv" and "swe" are what a track is
        // tagged with, so they are what someone reads off a file and types.
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

    // ONE row ticks, and it is the most specific one offered: a stored `fr-CA`
    // (what the player writes when you pick the VFQ track) ticks "Français
    // (Canada)", not "Français". Comparing on the base would tick both the
    // variant's parent and nothing else, and tapping that parent is exactly how
    // the variant used to get thrown away.
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

    /**
     * Open ON the current choice rather than at the top.
     *
     * Someone who already chose Swedish should see it ticked, not have to scroll
     * a hundred and forty rows to find out it stuck. It cannot be
     * `initialScrollIndex`: the sheet is MOUNTED the whole time the screen is
     * (that is what a modal sheet is), so an initial prop is read once, long
     * before anyone opens it. `onChange` fires on every present, which is when
     * the question is actually being asked.
     */
    const onChange = useCallback(
      (index: number) => {
        if (index < 0) return;
        const at = shown.findIndex(isActive);
        if (at > 0) list.current?.scrollToIndex({ index: at, animated: false, viewPosition: 0.5 });
      },
      [shown, isActive],
    );

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />
      ),
      [],
    );

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={SNAP_POINTS}
        // See the note at the top: with snap points AND a scrollable, dynamic
        // sizing measures the sheet against its header and the list covers it.
        enableDynamicSizing={false}
        onChange={onChange}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.background}
        handleIndicatorStyle={styles.handle}
        // `extend` rather than `interactive`: the search field sits at the TOP of
        // the sheet, so there is nothing to lift it above the keyboard for - and
        // a sheet that slides up on every keystroke is a sheet that never sits
        // still. The keyboard covers the bottom of the list, which is the part
        // you stopped reading the moment you started typing.
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        onDismiss={() => setQuery('')}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.searchBox}>
            <Icon name="search" size={17} stroke={2} color={colors.textFaint} />
            <BottomSheetTextInput
              value={query}
              // Back to the top on every keystroke. Without it, a list left
              // scrolled at "Suédois" keeps that offset when the filter cuts it
              // to four rows, and the answer you asked for is off the screen.
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
          // Explicit, and not a belt-and-braces `flex: 1`: the library only
          // applies its own to the ANDROID scrollable container (see
          // bottomSheetScrollable/ScrollableContainer.android). On iOS the list
          // is handed straight through, and a FlatList with no flex in a bounded
          // column takes its CONTENT's height - which here is a hundred and
          // eighty-six rows, out the bottom of the sheet.
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
              // Rule off the sentinels from the languages - but only where the
              // two actually meet, which a filtered list may not have.
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

/** Lower-cased and stripped of accents, so "suedois" finds "Suédois". The
 * combining-marks RANGE rather than `\p{Diacritic}`: unicode property escapes
 * are not something every Hermes build ships, and this is the same answer. */
function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  handle: { backgroundColor: colors.textFaint, width: 40 },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  title: { ...type.small, textTransform: 'uppercase', letterSpacing: 1 },
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
  /** A border INSIDE the row: the rule has to cost no height, or `getItemLayout`
   *  starts lying about where a row is. */
  ruled: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowLabel: { ...type.body, color: colors.text, fontWeight: '500', flexShrink: 1 },
  rowLabelActive: { color: colors.accent, fontWeight: '800' },
  rowCode: { ...type.small, color: colors.textFaint, letterSpacing: 0.5 },
  empty: { ...type.caption, textAlign: 'center', paddingVertical: spacing.lg },
});
