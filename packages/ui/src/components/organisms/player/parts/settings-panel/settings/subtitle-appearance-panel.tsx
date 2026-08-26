import { forwardRef, type ReactNode, useEffectEvent, useImperativeHandle } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { useListFocus } from '#ui/components/organisms/player/hooks/use-list-focus';
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
import { gradient } from '#ui/lib/css';
import { useT } from '#ui/services/i18n';
import { AppearanceRow, Choice, Meter, Seg, Swatches } from './subtitle-appearance-parts';

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

    // One effect event for the whole list: a closure per row would carry
    // `appearance`, which every nudge replaces.
    const nudge = useEffectEvent((i: number, dir: -1 | 1) => rows[i]?.nudge(dir));
    const focus = useListFocus({ count: rows.length, onHorizontal: nudge, onBack });
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
              index={i}
              label={r.label}
              focused={focus.index === i}
              onFocus={focus.setIndex}
              onNudge={nudge}
            >
              {r.control}
            </AppearanceRow>
          ))}
        </Box>
      </Box>
    );
  },
);
