import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Icon } from '#ui/components/atoms/icon';
import { Progress } from '#ui/components/atoms/progress';
import { Text } from '#ui/components/atoms/text';
import { SUB_COLORS } from '#ui/components/organisms/player/lib/subtitle-appearance';
import { VIRTUAL_FOCUS } from '#ui/lib/player/virtual-focus';
import { type StyleScope, sharedStyle, styles, useStyleScope, useTheme } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { a11yState } from '#ui/lib/a11y';
import { useFocusedRow } from '#ui/lib/use-focused-row';
import { FocusTargetHost, radiusOf } from '#ui/lib/focus-target';
import { useT } from '#ui/services/i18n';
import { panel, rowStyle } from './panel-style';

/**
 * Presentational parts of the {@link SubtitleAppearancePanel}: the value row and
 * the four controls a row can carry. Focus is state-driven (§15): a `focused`
 * boolean draws the ring, never CSS :hover.
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
  focused,
  onFocus,
  onNudge,
  children,
}: Readonly<{
  index: number;
  label: string;
  focused: boolean;
  onFocus: (index: number) => void;
  onNudge: (index: number, dir: -1 | 1) => void;
  children: ReactNode;
}>) {
  const panelScoped = useStyles(panel);

  const t = useT();
  const anchor = useFocusedRow(focused);
  const look = rowStyle(panelScoped.valueRow, panelScoped.valueRowOn, focused);
  return (
    <FocusTargetHost focused={focused} radius={radiusOf(look)}>
      <Box
        ref={anchor}
        role="group"
        accessibilityLabel={label}
        onPointerEnter={() => onFocus(index)}
        style={look}
      >
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
      </Box>
    </FocusTargetHost>
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
      <Icon name={icon} size={24} thickness={2.4} color={dim ? 'textDim' : 'accentText'} />
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
