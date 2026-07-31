// The device list itself: which screen should this play on.
//
// Shared between the bottom sheet (<CastSheet>) and the player's own panel
// (<CastPanel>): the player is a native fullScreenModal, and @gorhom's sheet
// renders into a host that sits behind it.

import type { CastReceiver } from '@kroma/core';
import { useCast } from '@kroma/ui';
import { Icon, styles } from '@kroma/ui/kit';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
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
        <View style={s.searchingRow}>
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
    <View style={s.empty}>
      <View style={s.emptyDisc}>
        <Icon name="device-tv" size={34} stroke={1.4} color={colors.textDim} />
      </View>
      <Text style={s.emptyTitle}>{t('cast.noDevices')}</Text>
      <Text style={s.emptyHint}>{t('cast.noDevicesHint')}</Text>
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
    <View style={s.searching}>
      <Animated.View style={[s.searchingDot, { opacity: pulse }]} />
      <Text style={s.searchingLabel}>{t('cast.searching')}</Text>
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
      style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Icon name={icon} size={24} stroke={1.8} color={selected ? colors.accent : colors.text} />
      <View style={s.rowText}>
        <Text numberOfLines={1} style={[s.rowName, selected && { color: colors.accent }]}>
          {name}
        </Text>
        <Text numberOfLines={1} style={s.rowDetail}>
          {detail}
        </Text>
      </View>
      {selected ? <Icon name="check" size={20} stroke={2.4} color={colors.accent} /> : null}
    </Pressable>
  );
}

const s = styles({
  row: { row: true, align: 'center', gap: spacing.sm, minH: 56, px: spacing.sm, radius: radius.md },
  rowText: { flex: true },
  rowName: { ...type.body, color: 'text', fontWeight: '600' },
  rowDetail: { ...type.caption, color: 'textMuted' },
  empty: { align: 'center', gap: 6, pt: spacing.md, pb: spacing.lg },
  searchingRow: { align: 'center' },
  emptyDisc: { center: true, w: 84, h: 84, mb: spacing.sm, bg: 'surface3', radius: 42 },
  emptyTitle: { ...type.section, color: 'text', textAlign: 'center' },
  emptyHint: {
    ...type.caption,
    maxW: 300,
    color: 'textMuted',
    textAlign: 'center',
    lineHeight: 20,
  },
  searching: {
    row: true,
    align: 'center',
    gap: 8,
    px: 14,
    py: 8,
    mt: spacing.md,
    // The surfaces around it are `surfaceRaised`; a pill in the same fill is no pill.
    bg: 'surface3',
    radius: radius.pill,
  },
  searchingDot: { w: 7, h: 7, bg: 'accent', radius: 4 },
  searchingLabel: { ...type.small, color: 'textMuted' },
});
