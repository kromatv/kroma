import { useT } from '@kromatv/ui';
import { Box, Button, Icon, style, Text } from '@kromatv/ui/kit';

const BACK = style({ radius: 999, mt: 8 });

export function StoppedNotice({
  message,
  onBack,
}: Readonly<{ message: string; onBack: () => void }>) {
  const t = useT();
  return (
    <Box fill z={80} center gap={24} px={64} bg="black/92">
      <Icon name="player-stop-filled" size={64} color="danger" />
      <Text variant="headingTv" textAlign="center" color="white">
        {t('player.stoppedTitle')}
      </Text>
      <Text variant="bodyTv" textAlign="center" maxW={672} color="text/72">
        {message || t('player.stoppedDefault')}
      </Text>
      <Button
        icon="chevron-left"
        label={t('player.back')}
        onPress={onBack}
        style={BACK}
        autoFocus
      />
    </Box>
  );
}
