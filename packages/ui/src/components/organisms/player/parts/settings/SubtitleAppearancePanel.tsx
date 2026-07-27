import { forwardRef, type ReactNode, useImperativeHandle } from 'react';
import { Pressable } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Progress } from '#ui/components/atoms/progress';
import { Txt } from '#ui/components/atoms/text';
import { useListFocus } from '#ui/components/organisms/player/hooks/useListFocus';
import type { PanelHandle } from '#ui/components/organisms/player/lib/nav';
import {
  SUB_COLORS,
  type SubEdge,
  type SubFont,
  type SubSize,
  type SubtitleAppearance,
  subtitleStyle,
} from '#ui/components/organisms/player/lib/subtitle-appearance';
import { VIRTUAL_FOCUS } from '#ui/components/organisms/player/lib/virtual-focus';
import { gradient } from '#ui/lib/css';
import { colors, fonts } from '#ui/lib/tokens';
import { useT } from '#ui/services/i18n';
import { rowStyle, valueLabel, valueRow, valueRowOn } from './panelStyle';

interface SubtitleAppearancePanelProps {
  appearance: SubtitleAppearance;
  onAppearance: (patch: Partial<SubtitleAppearance>) => void;
  onBack: () => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Move `dir` steps through `options` from `current`, clamped (no wrap). */
function step<V>(options: readonly V[], current: V, dir: -1 | 1): V {
  const i = options.indexOf(current);
  return options[clamp(Math.max(0, i) + dir, 0, options.length - 1)] ?? current;
}

const SIZES: SubSize[] = ['sm', 'md', 'lg', 'xl'];
const EDGES: SubEdge[] = ['shadow', 'box', 'outline', 'none'];
const FONTS: SubFont[] = ['sans', 'serif', 'mono'];

interface AppRow {
  key: string;
  label: string;
  nudge: (dir: -1 | 1) => void;
  control: ReactNode;
}

/**
 * Subtitle appearance (§8): a live preview above value rows for size, colour,
 * edge, font and opacity (plus box background opacity when the edge is a box).
 * ▲▼ move between rows, ◀▶ change the focused row's value.
 */
export const SubtitleAppearancePanel = forwardRef<PanelHandle, SubtitleAppearancePanelProps>(
  function SubtitleAppearancePanel({ appearance, onAppearance, onBack }, ref) {
    const t = useT();
    const set = (patch: Partial<SubtitleAppearance>) => onAppearance(patch);

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
        nudge: (d) => set({ edge: step(EDGES, appearance.edge, d) }),
        control: (
          <Seg<SubEdge>
            value={appearance.edge}
            options={[
              { v: 'shadow', label: t('subtitle.shadow') },
              { v: 'box', label: t('subtitle.box') },
              { v: 'outline', label: t('subtitle.outline') },
              { v: 'none', label: t('subtitle.none') },
            ]}
            onPick={(v) => set({ edge: v })}
          />
        ),
      },
      {
        key: 'font',
        label: t('player.subFont'),
        nudge: (d) => set({ font: step(FONTS, appearance.font, d) }),
        control: (
          <Seg<SubFont>
            value={appearance.font}
            options={[
              { v: 'sans', label: t('player.subFontSans') },
              { v: 'serif', label: t('player.subFontSerif') },
              { v: 'mono', label: t('player.subFontMono') },
            ]}
            onPick={(v) => set({ font: v })}
          />
        ),
      },
      {
        key: 'opacity',
        label: t('player.subOpacity'),
        nudge: (d) => set({ opacity: clamp(appearance.opacity + d * 10, 20, 100) }),
        control: <Meter value={appearance.opacity} />,
      },
    ];
    if (appearance.edge === 'box') {
      rows.push({
        key: 'bgOpacity',
        label: t('player.subBgOpacity'),
        nudge: (d) => set({ bgOpacity: clamp(appearance.bgOpacity + d * 5, 0, 100) }),
        control: <Meter value={appearance.bgOpacity} />,
      });
    }

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
          radius={14}
          borderWidth={1}
          border="rgba(255, 255, 255, 0.06)"
          px={20}
          py={16}
          mb={18}
          style={gradient('linear-gradient(135deg, #1c1c24, #0d0d11)')}
        >
          <Txt style={subtitleStyle(appearance)}>{t('player.subPreview')}</Txt>
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

/** A value row: a label + ◀▶ header, then the control beneath it. */
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
    <Box onPointerEnter={onFocus} style={rowStyle(valueRow, valueRowOn, focused)}>
      <Box row align="center" between mb={11}>
        <Txt style={valueLabel}>{label}</Txt>
        <Box row align="center" gap={16}>
          <Arrow glyph="◀" label="prev" dim={!focused} onPress={onDec} />
          <Arrow glyph="▶" label="next" dim={!focused} onPress={onInc} />
        </Box>
      </Box>
      {children}
    </Box>
  );
}

/** One ◀ / ▶ nudge control. Dimmed until its row holds focus, so the row that
 * the D-pad will act on is unambiguous. */
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
      <Txt
        style={{ fontSize: 17, lineHeight: 20, paddingHorizontal: 4, opacity: dim ? 0.4 : 1 }}
        color="accent"
      >
        {glyph}
      </Txt>
    </Pressable>
  );
}

/** Full-width segmented control (size / edge / font). */
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
            style={{
              flex: 1,
              borderRadius: 9,
              paddingVertical: 9,
              alignItems: 'center',
              backgroundColor: on ? colors.accent : 'rgba(255, 255, 255, 0.06)',
            }}
          >
            <Txt
              style={{ fontFamily: fonts.ui, fontWeight: '700', fontSize: 13 }}
              color={on ? 'accentInk' : 'rgba(244, 243, 240, 0.7)'}
            >
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </Box>
  );
}

/** Row of 32px colour swatches (subtitle colour). */
function Swatches({ value, onPick }: Readonly<{ value: string; onPick: (color: string) => void }>) {
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
              boxShadow: c === value ? '0 0 0 2px #F4B642' : '0 0 0 1px rgba(255, 255, 255, 0.2)',
            }}
          />
        </Pressable>
      ))}
    </Box>
  );
}

/** A read-only amber meter with a trailing percent (opacity rows). */
function Meter({ value }: Readonly<{ value: number }>) {
  return (
    <Box row align="center" gap={14}>
      <Box flex>
        <Progress value={value / 100} trackColor="rgba(255, 255, 255, 0.14)" rounded />
      </Box>
      <Txt style={METER_VALUE}>{`${value}%`}</Txt>
    </Box>
  );
}

const METER_VALUE = {
  minWidth: 52,
  textAlign: 'right' as const,
  fontFamily: fonts.ui,
  fontWeight: '700' as const,
  fontSize: 14,
  fontVariant: ['tabular-nums' as const],
};
