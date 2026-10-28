import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { Progress } from '#ui/components/atoms/progress';
import { Text } from '#ui/components/atoms/text';
import { SUB_COLORS } from '#ui/components/organisms/player/lib/subtitle-appearance';
import { VIRTUAL_FOCUS } from '#ui/lib/player/virtual-focus';
import { type StyleScope, sharedStyle, styles, useStyleScope, useTheme } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { a11yState } from '#ui/lib/a11y';
import { useT } from '#ui/services/i18n';
import { panel, VALUE_ROW_FOCUS } from './panel-style';

/**
 * Presentational parts of the {@link SubtitleAppearancePanel}: the value row and
 * the four controls a row can carry. A row is one control the remote walks:
 * Left and Right step its value, the arrows do the same for a pointer.
 */

const swatchRing = (selected: boolean, accent: string, scope: StyleScope) =>
  sharedStyle(
    `swatch:ring:${selected}:${accent}`,
    {
      boxShadow: selected ? `0 0 0 2px ${accent}` : '0 0 0 1px rgba(255, 255, 255, 0.2)',
    },
    scope,
  );
export function AppearanceRow({
  index,
  label,
  autoFocus,
  onNudge,
  children,
}: Readonly<{
  index: number;
  label: string;
  autoFocus?: boolean;
  onNudge: (index: number, dir: -1 | 1) => void;
  children: ReactNode;
}>) {
  const panelScoped = useStyles(panel);

  const t = useT();
  return (
    <Focusable
      // oxlint-disable-next-line jsx-a11y/aria-role -- React Native's vocabulary, not ARIA's - react-native-web renders `adjustable` as the ARIA `slider`.
      role="adjustable"
      label={label}
      autoFocus={autoFocus}
      onKey={(direction) => {
        if (direction !== 'left' && direction !== 'right') return false;
        onNudge(index, direction === 'left' ? -1 : 1);
        return true;
      }}
      states={VALUE_ROW_FOCUS}
      style={panelScoped.valueRow}
    >
      {({ focused }) => (
        <>
          <Box row align="center" between mb={11}>
            <Text style={panelScoped.valueLabel}>{label}</Text>
            <Box row align="center" gap={16}>
              <Arrow
                icon="chevron-left"
                label={`${t('common.decrease')} ${label}`}
                dim={!focused}
                onPress={() => onNudge(index, -1)}
              />
              <Arrow
                icon="chevron-right"
                label={`${t('common.increase')} ${label}`}
                dim={!focused}
                onPress={() => onNudge(index, 1)}
              />
            </Box>
          </Box>
          {children}
        </>
      )}
    </Focusable>
  );
}

function Arrow({
  icon,
  label,
  dim,
  onPress,
}: Readonly<{
  icon: 'chevron-left' | 'chevron-right';
  label: string;
  dim: boolean;
  onPress: () => void;
}>) {
  return (
    <Pressable
      {...VIRTUAL_FOCUS}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon name={icon} size={24} thickness={2.2} color={dim ? 'textDim' : 'accentText'} />
    </Pressable>
  );
}

export function Choice({ label }: Readonly<{ label: string }>) {
  const panelScoped = useStyles(panel);

  return (
    <Box row align="center" center px={14} style={panelScoped.pill} accessibilityRole="text">
      <Text style={panelScoped.pillLabel} color="text/92">
        {label}
      </Text>
    </Box>
  );
}

export function Seg<V extends string>({
  value,
  options,
  onPick,
}: Readonly<{ value: V; options: { v: V; label: string }[]; onPick: (v: V) => void }>) {
  return (
    <Box row gap={8}>
      {options.map((o) => (
        <SegCell key={o.v} value={o.v} label={o.label} on={o.v === value} onPick={onPick} />
      ))}
    </Box>
  );
}

function SegCell<V extends string>({
  value,
  label,
  on,
  onPick,
}: Readonly<{ value: V; label: string; on: boolean; onPick: (v: V) => void }>) {
  const panelScoped = useStyles(panel);

  const s = useStyles(sDefinition);

  return (
    <Pressable
      {...VIRTUAL_FOCUS}
      onPress={() => onPick(value)}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...a11yState({ selected: on })}
      style={[panelScoped.pill, s.segCell, on ? s.segOn : null]}
    >
      <Text style={panelScoped.pillLabel} color={on ? 'accentInk' : 'text/70'}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Swatches({
  value,
  onPick,
}: Readonly<{ value: string; onPick: (color: string) => void }>) {
  const { colors } = useTheme();
  return (
    <Box row gap={14}>
      {SUB_COLORS.map((c) => (
        <Swatch key={c} value={c} accent={colors.accent} selected={c === value} onPick={onPick} />
      ))}
    </Box>
  );
}

function Swatch({
  value,
  accent,
  selected,
  onPick,
}: Readonly<{
  value: (typeof SUB_COLORS)[number];
  accent: string;
  selected: boolean;
  onPick: (color: string) => void;
}>) {
  const scope = useStyleScope();

  return (
    <Pressable
      {...VIRTUAL_FOCUS}
      onPress={() => onPick(value)}
      accessibilityRole="button"
      accessibilityLabel={value}
      {...a11yState({ selected })}
    >
      <Box w={32} h={32} radius="pill" bg={value} style={swatchRing(selected, accent, scope)} />
    </Pressable>
  );
}

export function Meter({ value }: Readonly<{ value: number }>) {
  const s = useStyles(sDefinition);

  return (
    <Box row align="center" gap={14}>
      <Box flex>
        <Progress value={value / 100} trackColor="white/14" rounded />
      </Box>
      <Text style={s.meterValue}>{`${value}%`}</Text>
    </Box>
  );
}

const sDefinition = styles({
  meterValue: {
    minW: 52,
    textAlign: 'right',
    text: 'sectionTv',
    fontVariant: ['tabular-nums'],
  },
  segCell: { flex: 1, align: 'center' },
  segOn: { bg: 'accent' },
});
