import { apiErrorText } from '@kromatv/client';
import { useT } from '@kromatv/ui';
import { Callout } from '@kromatv/ui/kit';

export function NetworkLoadFailed({ error }: Readonly<{ error: unknown }>) {
  const t = useT();
  return (
    <Callout.Root tone="danger" icon="wifi-off">
      <Callout.Title>{t('network.loadFailed')}</Callout.Title>
      <Callout.Detail>{apiErrorText(error, t('network.loadFailedHint'))}</Callout.Detail>
    </Callout.Root>
  );
}
