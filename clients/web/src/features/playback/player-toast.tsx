import { useT } from '@kroma/ui';
import { Box, backdropBlur, IconButton, Row, Text } from '@kroma/ui/kit';

/** Centered top toast for transient player notices (audio re-encode, resume, errors). */
export function Toast({
  variant,
  onDismiss,
  action,
  children,
}: Readonly<{
  variant: 'info' | 'danger';
  onDismiss: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}>) {
  const t = useT();
  return (
    <Box absolute top={24} left={0} right={0} z={40} align="center" pointerEvents="box-none">
      <Row
        maxW={640}
        gap={12}
        px={16}
        py={12}
        radius="xl"
        bg="black/80"
        border={variant === 'danger' ? 'danger/40' : 'white/15'}
        style={FROST}
      >
        <Text variant="meta" color="white/90">
          {children}
        </Text>
        {action}
        <IconButton
          variant="ghost"
          size={28}
          glyph={16}
          icon="x"
          label={t('player.dismiss')}
          onPress={onDismiss}
        />
      </Row>
    </Box>
  );
}

const FROST = backdropBlur(12);
