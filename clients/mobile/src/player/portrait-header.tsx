import { Box, IconButton, styles, Text, useStyles } from '@kromatv/ui/kit';
import { useT } from '#mobile/lib/i18n';
import { spacing, type } from '#mobile/lib/theme';

export function PortraitHeader({
  onBack,
  onCast,
  onSettings,
}: Readonly<{ onBack(): void; onCast(): void; onSettings(): void }>) {
  const s = useStyles(definition);
  const t = useT();
  return (
    <Box style={s.header}>
      <IconButton
        variant="ghost"
        diameter={44}
        icon="chevron-left"
        glyph={24}
        label={t('common.back')}
        onPress={onBack}
      />
      <Text style={s.context}>{t('player.nowPlaying')}</Text>
      <Box style={s.actions}>
        <IconButton
          variant="ghost"
          diameter={44}
          icon="cast"
          glyph={21}
          label={t('cast.moveToTv')}
          onPress={onCast}
        />
        <IconButton
          variant="ghost"
          diameter={44}
          icon="settings"
          glyph={21}
          label={t('player.settings')}
          onPress={onSettings}
        />
      </Box>
    </Box>
  );
}

const definition = styles({
  header: { row: true, align: 'center', px: spacing.sm, pb: spacing.xs },
  context: { ...type.caption, color: 'textMuted', flex: true, ml: spacing.xs },
  actions: { row: true, align: 'center' },
});
