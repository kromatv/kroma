// Audio / subtitle picker for the remote.
//
// The rows are the TV's OWN track list, labelled the way that player labels them
// (the receiver sends both with its heartbeat), so what this phone offers is
// what the set across the room can actually switch to - never a track derived
// from the file that its player would refuse.

import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { CastTrack } from '@kroma/core';
import { Icon } from '@kroma/ui/kit';
import { forwardRef, useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

interface TrackPickerSheetProps {
  title: string;
  tracks: CastTrack[];
  /** The live selection, or null when none / off. */
  activeIndex: number | null;
  /** When given, an "off" row is offered above the tracks (subtitles). */
  offLabel?: string;
  /** `null` picks "off"; only reachable when `offLabel` is set. */
  onPick: (index: number | null) => void;
}

export const TrackPickerSheet = forwardRef<BottomSheetModal, TrackPickerSheetProps>(
  function TrackPickerSheet({ title, tracks, activeIndex, offLabel, onPick }, ref) {
    const insets = useSafeAreaInsets();
    const backdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />
      ),
      [],
    );

    return (
      <BottomSheetModal
        ref={ref}
        backdropComponent={backdrop}
        handleIndicatorStyle={styles.handle}
        backgroundStyle={styles.sheet}
      >
        <BottomSheetView style={[styles.body, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.title}>{title}</Text>
          {/* Bounded: a long-dubbed film can carry a dozen tracks, and the sheet
              still has to stop somewhere short of the whole screen. */}
          <ScrollView style={styles.list} bounces={false}>
            {offLabel ? (
              <Row label={offLabel} selected={activeIndex == null} onPress={() => onPick(null)} />
            ) : null}
            {tracks.map((track) => (
              <Row
                key={track.index}
                label={track.label}
                selected={track.index === activeIndex}
                onPress={() => onPick(track.index)}
              />
            ))}
          </ScrollView>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

function Row({
  label,
  selected,
  onPress,
}: Readonly<{ label: string; selected: boolean; onPress(): void }>) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <Text numberOfLines={1} style={[styles.rowLabel, selected && { color: colors.accent }]}>
        {label}
      </Text>
      {selected ? <Icon name="check" size={20} stroke={2.4} color={colors.accent} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: colors.surfaceRaised },
  handle: { backgroundColor: colors.textFaint },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  title: { ...type.title, color: colors.text, marginBottom: spacing.sm },
  list: { maxHeight: 380 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  rowLabel: { ...type.body, color: colors.text, flex: 1 },
});
