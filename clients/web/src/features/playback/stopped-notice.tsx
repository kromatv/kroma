import { useT } from '@kromatv/ui';
import { Box, Button, backdropBlur, Icon, styles, Text } from '@kromatv/ui/kit';

const s = styles({ frost: backdropBlur(4) });

export function StoppedNotice({
  message,
  onBack,
}: Readonly<{ message: string; onBack: () => void }>) {
  const t = useT();
  return (
    <Box fill z={80} center gap={20} px={32} bg="black/85" style={s.frost}>
      <Icon name="player-stop-filled" size={52} color="danger" />
      <Text variant="body" color="white/80" maxW={460} textAlign="center">
        {message}
      </Text>
      <Button
        variant="primary"
        size="sm"
        icon="chevron-left"
        label={t('player.back')}
        onPress={onBack}
      />
    </Box>
  );
}
