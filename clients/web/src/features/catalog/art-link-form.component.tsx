import { useT } from '@kromatv/ui';
import { Box, Button, Field } from '@kromatv/ui/kit';
import { useState } from 'react';

/** The address field of one picture in the artwork dialog: `onLink` gets the
 * trimmed address once it is sent, from the button or the Enter key. */
export function ArtLinkForm({
  busy,
  disabled,
  onLink,
}: Readonly<{ busy: boolean; disabled: boolean; onLink: (url: string) => void }>) {
  const t = useT();
  const [url, setUrl] = useState('');
  const link = url.trim();
  const send = () => {
    if (link && !disabled) {
      onLink(link);
    }
  };
  return (
    <Box gap={8}>
      <Field.Root label={t('artwork.linkLabel')} value={url} onValueChange={setUrl}>
        <Field.Input type="url" placeholder="https://" autoFocus onSubmit={send} />
      </Field.Root>
      <Button
        variant="glass"
        size="sm"
        label={t('artwork.linkApply')}
        loading={busy}
        disabled={disabled || !link}
        onPress={send}
      />
    </Box>
  );
}
