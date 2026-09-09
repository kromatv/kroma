import { useT } from '@kromatv/ui';
import { Box, backdropBlur, IconButton, Row, styles, Text } from '@kromatv/ui/kit';

/** Centered top toast for transient player notices (audio re-encode, resume, errors). */
export function Toast({
  variant,
  onDismiss,
  action,
  top = 24,
  children,
}: Readonly<{
  variant: 'info' | 'danger';
  onDismiss: () => void;
  action?: React.ReactNode;
  top?: number;
  children: React.ReactNode;
}>) {
  const t = useT();
  return (
    <Box absolute top={top} left={0} right={0} z={40} align="center" pointerEvents="box-none">
      <Row
        maxW={640}
        gap={12}
        px={16}
        py={12}
        radius="xl"
        bg="black/80"
        border={variant === 'danger' ? 'danger/40' : 'white/15'}
        style={s.frost}
      >
        <Text variant="meta" color="white/90">
          {children}
        </Text>
        {action}
        <IconButton
          variant="ghost"
          diameter={28}
          glyph={16}
          icon="x"
          label={t('player.dismiss')}
          onPress={onDismiss}
        />
      </Row>
    </Box>
  );
}

const s = styles({ frost: backdropBlur(12) });
