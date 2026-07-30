// Audio / subtitle picker for the remote.
//
// Rows come from the receiver's own track list (sent with its heartbeat), so
// only tracks the TV can actually switch to are ever offered.

import { BottomSheetModal } from '@gorhom/bottom-sheet';
import type { CastTrack } from '@kroma/core';
import { Icon } from '@kroma/ui/kit';
import { forwardRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SheetBody, SheetTitle, sheetChrome } from '#mobile/components/ui';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

interface TrackPickerSheetProps {
  title: string;
  tracks: CastTrack[];
  activeIndex: number | null;
  offLabel?: string;
  onPick: (index: number | null) => void;
}

export const TrackPickerSheet = forwardRef<BottomSheetModal, TrackPickerSheetProps>(
  function TrackPickerSheet({ title, tracks, activeIndex, offLabel, onPick }, ref) {
    return (
      <BottomSheetModal ref={ref} {...sheetChrome}>
        <SheetBody>
          <SheetTitle>{title}</SheetTitle>
          {/* Bounded: a long-dubbed film can carry a dozen tracks, so the sheet
              stops short of the full screen; <SheetBody>'s drawer floor covers
              the other end. */}
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
        </SheetBody>
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
