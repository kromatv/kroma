import { BackButton, Box, Button, Icon, Spinner, styles, Text, useStyles } from '@kromatv/ui/kit';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import { spacing, type } from '#mobile/lib/theme';

export function PlayerStatusScreen({
  message,
  title,
  detail,
  loading = false,
  onBack,
  onRetry,
}: Readonly<{
  message: string;
  title?: string;
  detail?: string;
  loading?: boolean;
  onBack(): void;
  onRetry?(): void;
}>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const insets = useSafeAreaInsets();

  return (
    <Box
      style={[
        s.stage,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: Math.max(insets.left, spacing.md),
          paddingRight: Math.max(insets.right, spacing.md),
        },
      ]}
    >
      <Box style={s.header}>
        <BackButton variant="scrim" diameter={44} label={t('player.back')} onPress={onBack} />
      </Box>
      <ScrollView style={s.body} contentContainerStyle={s.content}>
        {loading ? <Spinner size={36} /> : <Icon name="alert-circle" size={36} color="textMuted" />}
        {title ? <Text style={s.title}>{title}</Text> : null}
        <Text style={s.message}>{message}</Text>
        {detail ? (
          <Box style={s.detail}>
            <Text selectable style={s.detailText}>
              {detail}
            </Text>
          </Box>
        ) : null}
        {!loading ? (
          <Box style={s.actions}>
            <Button label={t('player.back')} onPress={onBack} />
            {onRetry ? <Button variant="glass" label={t('error.retry')} onPress={onRetry} /> : null}
          </Box>
        ) : null}
      </ScrollView>
    </Box>
  );
}

const sDefinition = styles({
  stage: { flex: true, bg: 'bg' },
  header: { py: spacing.sm, align: 'flex-start' },
  body: { flex: true },
  content: { flexGrow: 1, center: true, gap: spacing.md, py: spacing.lg },
  message: { ...type.body, color: 'textMuted', textAlign: 'center', maxW: 560 },
  title: { ...type.heading, textAlign: 'center', maxW: 560 },
  detail: { w: '100%', maxW: 560, p: spacing.md, bg: 'surface1', radius: 'md' },
  detailText: { ...type.caption, color: 'textMuted', textAlign: 'center' },
  actions: { row: true, wrap: true, center: true, gap: spacing.sm },
});
