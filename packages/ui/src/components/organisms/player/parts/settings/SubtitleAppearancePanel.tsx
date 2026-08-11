import { forwardRef, type ReactNode, useImperativeHandle } from 'react';
import { Pressable } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Progress } from '#ui/components/atoms/progress';
import { Text } from '#ui/components/atoms/text';
import { useListFocus } from '#ui/components/organisms/player/hooks/useListFocus';
import type { PanelHandle } from '#ui/components/organisms/player/lib/nav';
import {
  SUB_COLORS,
  SUB_EDGES,
  SUB_FONTS,
  type SubEdge,
  type SubFont,
  type SubSize,
  type SubtitleAppearance,
  subtitleStyle,
  subtitleWindowStyle,
} from '#ui/components/organisms/player/lib/subtitle-appearance';
import { VIRTUAL_FOCUS } from '#ui/components/organisms/player/lib/virtual-focus';
import { styles, useTheme } from '#ui/core';
import { gradient } from '#ui/lib/css';
import { useT } from '#ui/services/i18n';
import { panel, rowStyle } from './panelStyle';

interface SubtitleAppearancePanelProps {
  appearance: SubtitleAppearance;
  onAppearanceChange: (patch: Partial<SubtitleAppearance>) => void;
  onBack: () => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function step<V>(options: readonly V[], current: V, dir: -1 | 1): V {
  const i = options.indexOf(current);
  return options[clamp(Math.max(0, i) + dir, 0, options.length - 1)] ?? current;
}

const SIZES: SubSize[] = ['sm', 'md', 'lg', 'xl'];

const EDGE_LABEL = {
  none: 'subtitle.none',
  raised: 'subtitle.raised',
  depressed: 'subtitle.depressed',
  uniform: 'subtitle.uniform',
  shadow: 'subtitle.shadow',
} as const satisfies Record<SubEdge, string>;

const FONT_LABEL = {
  default: 'player.subFontDefault',
  monoSerif: 'player.subFontMonoSerif',
  propSerif: 'player.subFontPropSerif',
  monoSans: 'player.subFontMonoSans',
  propSans: 'player.subFontPropSans',
  casual: 'player.subFontCasual',
  cursive: 'player.subFontCursive',
  smallCaps: 'player.subFontSmallCaps',
} as const satisfies Record<SubFont, string>;

interface AppRow {
  key: string;
  label: string;
  nudge: (dir: -1 | 1) => void;
  control: ReactNode;
}

/**
 * A live preview above value rows for CEA-708's three layers: the text, the box
 * behind it, and the window the block sits in. ▲▼ move between rows, ◀▶ change
 * the focused row's value.
 */
export const SubtitleAppearancePanel = forwardRef<PanelHandle, SubtitleAppearancePanelProps>(
  function SubtitleAppearancePanel({ appearance, onAppearanceChange, onBack }, ref) {
    const t = useT();
    const set = (patch: Partial<SubtitleAppearance>) => onAppearanceChange(patch);

    const rows: AppRow[] = [
      {
        key: 'size',
        label: t('player.subSize'),
        nudge: (d) => set({ size: step(SIZES, appearance.size, d) }),
        control: (
          <Seg<SubSize>
            value={appearance.size}
            options={[
              { v: 'sm', label: 'S' },
              { v: 'md', label: 'M' },
              { v: 'lg', label: 'L' },
              { v: 'xl', label: 'XL' },
            ]}
            onPick={(v) => set({ size: v })}
          />
        ),
      },
      {
        key: 'color',
        label: t('player.subColor'),
        nudge: (d) => set({ color: step(SUB_COLORS, appearance.color, d) }),
        control: <Swatches value={appearance.color} onPick={(c) => set({ color: c })} />,
      },
      {
        key: 'edge',
        label: t('player.subEdge'),
        nudge: (d) => set({ edge: step(SUB_EDGES, appearance.edge, d) }),
        control: <Choice label={t(EDGE_LABEL[appearance.edge])} />,
      },
      {
        key: 'font',
        label: t('player.subFont'),
        nudge: (d) => set({ font: step(SUB_FONTS, appearance.font, d) }),
        control: <Choice label={t(FONT_LABEL[appearance.font])} />,
      },
      {
        key: 'opacity',
        label: t('player.subOpacity'),
        nudge: (d) => set({ opacity: clamp(appearance.opacity + d * 10, 20, 100) }),
        control: <Meter value={appearance.opacity} />,
      },
      {
        key: 'bgOpacity',
        label: t('player.subBgOpacity'),
        nudge: (d) => set({ bgOpacity: clamp(appearance.bgOpacity + d * 5, 0, 100) }),
        control: <Meter value={appearance.bgOpacity} />,
      },
      // A layer's colour is only worth a row once that layer is visible.
      ...(appearance.bgOpacity > 0
        ? [
            {
              key: 'bgColor',
              label: t('player.subBgColor'),
              nudge: (d: -1 | 1) => set({ bgColor: step(SUB_COLORS, appearance.bgColor, d) }),
              control: <Swatches value={appearance.bgColor} onPick={(c) => set({ bgColor: c })} />,
            },
          ]
        : []),
      {
        key: 'windowOpacity',
        label: t('player.subWindowOpacity'),
        nudge: (d) => set({ windowOpacity: clamp(appearance.windowOpacity + d * 5, 0, 100) }),
        control: <Meter value={appearance.windowOpacity} />,
      },
      ...(appearance.windowOpacity > 0
        ? [
            {
              key: 'windowColor',
              label: t('player.subWindowColor'),
              nudge: (d: -1 | 1) =>
                set({ windowColor: step(SUB_COLORS, appearance.windowColor, d) }),
              control: (
                <Swatches value={appearance.windowColor} onPick={(c) => set({ windowColor: c })} />
              ),
            },
          ]
        : []),
    ];

    const focus = useListFocus({
      count: rows.length,
      onHorizontal: (i, d) => rows[i]?.nudge(d),
      onBack,
    });
    useImperativeHandle(ref, () => ({ onKey: focus.onKey }), [focus.onKey]);

    return (
      <Box>
        <Box
          minH={92}
          center
          radius="lg"
          borderWidth={1}
          border="white/6"
          px={20}
          py={16}
          mb={18}
          style={gradient('linear-gradient(135deg, #1c1c24, #0d0d11)')}
        >
          <Box style={subtitleWindowStyle(appearance)}>
            <Text style={subtitleStyle(appearance)}>{t('player.subPreview')}</Text>
          </Box>
        </Box>
        <Box gap={10}>
          {rows.map((r, i) => (
            <AppearanceRow
              key={r.key}
              label={r.label}
              focused={focus.index === i}
              onFocus={focus.hover(i)}
              onDec={() => r.nudge(-1)}
              onInc={() => r.nudge(1)}
            >
              {r.control}
            </AppearanceRow>
          ))}
        </Box>
      </Box>
    );
  },
);

function AppearanceRow({
  label,
  focused,
  onFocus,
  onDec,
  onInc,
  children,
}: Readonly<{
  label: string;
  focused: boolean;
  onFocus: () => void;
  onDec: () => void;
  onInc: () => void;
  children: ReactNode;
}>) {
  return (
    <Box onPointerEnter={onFocus} style={rowStyle(panel.valueRow, panel.valueRowOn, focused)}>
      <Box row align="center" between mb={11}>
        <Text style={panel.valueLabel}>{label}</Text>
        <Box row align="center" gap={16}>
          <Arrow glyph="◀" label="prev" dim={!focused} onPress={onDec} />
          <Arrow glyph="▶" label="next" dim={!focused} onPress={onInc} />
        </Box>
      </Box>
      {children}
    </Box>
  );
}

function Arrow({
  glyph,
  label,
  dim,
  onPress,
}: Readonly<{ glyph: string; label: string; dim: boolean; onPress: () => void }>) {
  return (
    <Pressable
      {...VIRTUAL_FOCUS}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[s.arrow, { opacity: dim ? 0.4 : 1 }]} color="accentText">
        {glyph}
      </Text>
    </Pressable>
  );
}

function Choice({ label }: Readonly<{ label: string }>) {
  return (
    <Box row align="center" center px={14} style={panel.pill} accessibilityRole="text">
      <Text style={panel.pillLabel} color="text/92">
        {label}
      </Text>
    </Box>
  );
}

function Seg<V extends string>({
  value,
  options,
  onPick,
}: Readonly<{ value: V; options: { v: V; label: string }[]; onPick: (v: V) => void }>) {
  return (
    <Box row gap={8}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <Pressable
            {...VIRTUAL_FOCUS}
            key={o.v}
            onPress={() => onPick(o.v)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[panel.pill, s.segCell, on ? s.segOn : null]}
          >
            <Text style={panel.pillLabel} color={on ? 'accentInk' : 'text/70'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </Box>
  );
}

function Swatches({ value, onPick }: Readonly<{ value: string; onPick: (color: string) => void }>) {
  const { colors } = useTheme();
  return (
    <Box row gap={14}>
      {SUB_COLORS.map((c) => (
        <Pressable
          {...VIRTUAL_FOCUS}
          key={c}
          onPress={() => onPick(c)}
          accessibilityRole="button"
          accessibilityLabel={c}
        >
          <Box
            w={32}
            h={32}
            radius="pill"
            bg={c}
            style={{
              boxShadow:
                c === value ? `0 0 0 2px ${colors.accent}` : '0 0 0 1px rgba(255, 255, 255, 0.2)',
            }}
          />
        </Pressable>
      ))}
    </Box>
  );
}

function Meter({ value }: Readonly<{ value: number }>) {
  return (
    <Box row align="center" gap={14}>
      <Box flex>
        <Progress value={value / 100} trackColor="white/14" rounded />
      </Box>
      <Text style={s.meterValue}>{`${value}%`}</Text>
    </Box>
  );
}

const s = styles({
  arrow: { px: 4, text: 'strongTv' },
  meterValue: {
    minW: 52,
    textAlign: 'right',
    text: 'sectionTv',
    fontVariant: ['tabular-nums'],
  },
  segCell: { flex: 1, align: 'center' },
  segOn: { bg: 'accent' },
});
