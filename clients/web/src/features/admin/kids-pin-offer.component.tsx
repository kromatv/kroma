import { useT } from '@kromatv/ui';
import { Box, Dialog, IconWell, Text } from '@kromatv/ui/kit';

/** Offers the admin a profile PIN right after a Kids profile is made, when
 *  theirs has none (ACCT-133): leaving Kids goes through the picker. */
export function KidsPinOffer({
  onSkip,
  onAccept,
}: Readonly<{ onSkip: () => void; onAccept: () => void }>) {
  const t = useT();
  return (
    <Dialog.Root open title={t('admin.kidsPinOfferTitle')} width="sm" onClose={onSkip}>
      <Box center gap={18} py={8}>
        <IconWell name="lock" size="tv" tone="accent" />
        <Text variant="body" color="textMuted" textAlign="center" maxW={360}>
          {t('admin.kidsPinOfferBody')}
        </Text>
      </Box>
      <Dialog.Footer>
        <Dialog.Actions
          onCancel={onSkip}
          cancelLabel={t('admin.kidsPinOfferSkip')}
          onConfirm={onAccept}
          confirmLabel={t('admin.kidsPinOfferSet')}
        />
      </Dialog.Footer>
    </Dialog.Root>
  );
}
