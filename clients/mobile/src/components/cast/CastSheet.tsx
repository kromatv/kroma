// The device picker: which screen should this play on.
//
// Sizes itself to its content (a household has a handful of TVs, not a hundred
// languages), so unlike LangPickerSheet it keeps @gorhom's dynamic sizing and a
// <BottomSheetView>.
//
// "This device" sits at the top and is a real row, not a cancel: the choice is
// between screens, and going back to the phone is one of them.

import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { CastReceiver } from '@kroma/core';
import { useCast } from '@kroma/ui';
import { Icon } from '@kroma/ui/kit';
import { forwardRef, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

interface CastSheetProps {
  /** `null` = "this device": stop casting and play here. */
  onPick: (receiverId: string | null) => void;
  /** Show the "this device" row. Off where playing locally makes no sense. */
  offerLocal?: boolean;
}

export const CastSheet = forwardRef<BottomSheetModal, CastSheetProps>(function CastSheet(
  { onPick, offerLocal = true },
  ref,
) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { receivers, active } = useCast();

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
        <Text style={styles.title}>{t('cast.title')}</Text>

        {offerLocal ? (
          <DeviceRow
            icon="device-mobile"
            name={t('cast.thisDevice')}
            detail={t('cast.playHere')}
            selected={!active}
            onPress={() => onPick(null)}
          />
        ) : null}

        {receivers.map((r) => (
          <DeviceRow
            key={r.id}
            icon="device-tv"
            name={r.name}
            detail={detailOf(r, t)}
            selected={active?.id === r.id}
            onPress={() => onPick(r.id)}
          />
        ))}

        {receivers.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('cast.noDevices')}</Text>
            <Text style={styles.emptyHint}>{t('cast.noDevicesHint')}</Text>
          </View>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

/** The second line of a device row: what it is playing, else whose profile it
 * is on - which is what tells two identical Apple TVs apart. */
function detailOf(r: CastReceiver, t: ReturnType<typeof useT>): string {
  const playing = r.nowPlaying?.item;
  if (playing) return playing.metadata?.title ?? playing.title;
  return `${r.username} · ${t('cast.idle')}`;
}

function DeviceRow({
  icon,
  name,
  detail,
  selected,
  onPress,
}: Readonly<{
  icon: 'device-tv' | 'device-mobile';
  name: string;
  detail: string;
  selected: boolean;
  onPress(): void;
}>) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Icon name={icon} size={24} stroke={1.8} color={selected ? colors.accent : colors.text} />
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[styles.rowName, selected && { color: colors.accent }]}>
          {name}
        </Text>
        <Text numberOfLines={1} style={styles.rowDetail}>
          {detail}
        </Text>
      </View>
      {selected ? <Icon name="check" size={20} stroke={2.4} color={colors.accent} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: colors.surfaceRaised },
  handle: { backgroundColor: colors.textFaint },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.xs, gap: 2 },
  title: { ...type.title, color: colors.text, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  rowText: { flex: 1 },
  rowName: { ...type.body, color: colors.text, fontWeight: '600' },
  rowDetail: { ...type.caption, color: colors.textDim },
  empty: { paddingVertical: spacing.lg, gap: 6, alignItems: 'center' },
  emptyTitle: { ...type.body, color: colors.text },
  emptyHint: { ...type.caption, color: colors.textDim, textAlign: 'center' },
});
