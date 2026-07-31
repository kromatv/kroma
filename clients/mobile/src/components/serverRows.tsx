// The server list visual language shared by the onboarding screens: rows in a
// soft surface card (name + host sub-line + chevron, color-only press
// feedback) plus the uppercase section header and hint that frame them.

import { Icon, Spinner, styles } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

/** Soft surface card the rows stack in (the profile-rows card language). */
export function ServerList({ children }: Readonly<{ children: ReactNode }>) {
  return <View style={s.list}>{children}</View>;
}

export function ServerRow({
  name,
  host,
  icon,
  disabled,
  dimmed,
  onPress,
}: Readonly<{
  name: string;
  host?: string | null;
  icon?: ReactNode;
  disabled?: boolean;
  dimmed?: boolean;
  onPress(): void;
}>) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.row,
        pressed && { backgroundColor: colors.surfaceHigh },
        dimmed && { opacity: 0.5 },
      ]}
    >
      {icon ? <View style={s.leadIcon}>{icon}</View> : null}
      <View style={s.text}>
        <Text numberOfLines={1} style={s.name}>
          {name}
        </Text>
        {host ? (
          <Text numberOfLines={1} style={s.host}>
            {host}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-right" size={16} stroke={2.2} color={colors.textFaint} />
    </Pressable>
  );
}

/** Uppercase section header; `loading` appends a small spinner (live scan). */
export function ServerSectionHeader({
  title,
  loading,
}: Readonly<{ title: string; loading?: boolean }>) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      {loading ? <Spinner size={18} color={colors.textFaint} /> : null}
    </View>
  );
}

export function ServerSectionHint({ children }: Readonly<{ children: string }>) {
  return <Text style={s.sectionHint}>{children}</Text>;
}

const s = styles({
  list: { px: 6, py: 4, bg: 'surface1', radius: radius.lg },
  row: { row: true, align: 'center', gap: spacing.sm, minH: 56, px: spacing.sm, radius: radius.md },
  text: { flex: true, gap: 1 },
  name: { ...type.body, color: 'text', fontWeight: '600' },
  host: { ...type.small, color: 'textMuted' },
  leadIcon: { center: true, w: 30, h: 30, bg: 'accentSoft', radius: 15 },
  sectionHeader: { row: true, align: 'center', gap: 10, px: spacing.xs },
  sectionTitle: { ...type.small, textTransform: 'uppercase', letterSpacing: 1.2 },
  sectionHint: { ...type.small, px: spacing.xs },
});
