// The device list itself: which screen should this play on.
//
// Shared between the bottom sheet (<CastSheet>) and the player's own panel
// (<CastPanel>): the player is a native fullScreenModal, and @gorhom's sheet
// renders into a host that sits behind it.

import type { CastReceiver } from '@kroma/core';
import { useCast } from '@kroma/ui';
import { Icon } from '@kroma/ui/kit';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SheetTitle } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

export interface CastDeviceListProps {
  onPick: (receiverId: string | null) => void;
  offerLocal?: boolean;
}

export function CastDeviceList({ onPick, offerLocal = true }: Readonly<CastDeviceListProps>) {
  const t = useT();
  const { receivers, active } = useCast();

  return (
    <>
      <SheetTitle>{t('cast.title')}</SheetTitle>

      {offerLocal ? (
        <DeviceRow
          icon="device-mobile"
          name={t('cast.thisDevice')}
          // Say which of the two it is: leaving a TV behind is a different act
          // from choosing where to start something.
          detail={active ? t('cast.disconnect') : t('cast.playHere')}
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
        <NoDevices />
      ) : (
        // Shown even with devices already listed: the roster is live, so a
        // second receiver can still appear below.
        <View style={styles.searchingRow}>
          <Searching />
        </View>
      )}
    </>
  );
}

// Not a dead end: the roster stays live, so a device that wakes up appears
// here without reopening the picker.
function NoDevices() {
  const t = useT();

  return (
    <View style={styles.empty}>
      <View style={styles.emptyDisc}>
        <Icon name="device-tv" size={34} stroke={1.4} color={colors.textDim} />
      </View>
      <Text style={styles.emptyTitle}>{t('cast.noDevices')}</Text>
      <Text style={styles.emptyHint}>{t('cast.noDevicesHint')}</Text>
      <Searching />
    </View>
  );
}

function Searching() {
  const t = useT();
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.searching}>
      <Animated.View style={[styles.searchingDot, { opacity: pulse }]} />
      <Text style={styles.searchingLabel}>{t('cast.searching')}</Text>
    </View>
  );
}

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
  empty: { paddingTop: spacing.md, paddingBottom: spacing.lg, gap: 6, alignItems: 'center' },
  searchingRow: { alignItems: 'center' },
  emptyDisc: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: { ...type.section, color: colors.text, textAlign: 'center' },
  emptyHint: {
    ...type.caption,
    color: colors.textDim,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 20,
  },
  searching: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    // The surfaces around it are `surfaceRaised`; a pill in the same fill is no pill.
    backgroundColor: colors.surfaceHigh,
  },
  searchingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  searchingLabel: { ...type.small, color: colors.textDim },
});
