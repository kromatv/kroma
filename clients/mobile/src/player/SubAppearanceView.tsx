import type { SubtitleAppearance } from '@kroma/ui';
import { SUB_COLORS } from '@kroma/ui';
import { Box, Chip, styles } from '@kroma/ui/kit';
import { Pressable } from 'react-native';
import type { useT } from '#mobile/lib/i18n';
import { ChipGroup, SubHeader } from './TrackSheetRows';

export const sizeName: Record<SubtitleAppearance['size'], string> = {
  sm: 'S',
  md: 'M',
  lg: 'L',
  xl: 'XL',
};

export function SubAppearanceView({
  t,
  appearance,
  onAppearance,
  onBack,
}: Readonly<{
  t: ReturnType<typeof useT>;
  appearance: SubtitleAppearance;
  onAppearance(next: Partial<SubtitleAppearance>): void;
  onBack(): void;
}>) {
  return (
    <Box>
      <SubHeader title={t('player.subAppearance')} onBack={onBack} />
      <ChipGroup label={t('player.subSize')}>
        {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
          <Chip
            key={size}
            label={sizeName[size]}
            active={appearance.size === size}
            onPress={() => onAppearance({ size })}
          />
        ))}
      </ChipGroup>
      <ChipGroup label={t('player.subColor')}>
        {SUB_COLORS.map((color) => (
          <Pressable
            key={color}
            onPress={() => onAppearance({ color })}
            style={[s.swatch, { backgroundColor: color }, appearance.color === color && s.swatchOn]}
          />
        ))}
      </ChipGroup>
      <ChipGroup label={t('player.subEdge')}>
        {(
          [
            ['shadow', t('subtitle.shadow')],
            ['uniform', t('subtitle.uniform')],
            ['raised', t('subtitle.raised')],
            ['depressed', t('subtitle.depressed')],
            ['none', t('subtitle.none')],
          ] as const
        ).map(([edge, label]) => (
          <Chip
            key={edge}
            label={label}
            active={appearance.edge === edge}
            onPress={() => onAppearance({ edge })}
          />
        ))}
      </ChipGroup>
    </Box>
  );
}

const s = styles({
  swatch: { w: 30, h: 30, radius: 15, border: 'transparent', borderWidth: 2 },
  swatchOn: { borderColor: 'accent' },
});
