import { useT } from '@kromatv/ui';
import { Box, Dialog, IconButton, Row, Text } from '@kromatv/ui/kit';

/** The head of a dialog that changes one title: what the dialog edits, the
 * title's name, and a close button. */
export function TitleDialogHeader({
  overline,
  title,
  onClose,
}: Readonly<{ overline: string; title: string; onClose: () => void }>) {
  const t = useT();
  return (
    <Dialog.Header>
      <Row between align="flex-start" gap={16}>
        <Box minW={0}>
          <Text variant="overline" color="white/40">
            {overline}
          </Text>
          <Text variant="title" mt={4} lines={1}>
            {title}
          </Text>
        </Box>
        <IconButton control="sm" icon="x" label={t('common.close')} onPress={onClose} />
      </Row>
    </Dialog.Header>
  );
}
