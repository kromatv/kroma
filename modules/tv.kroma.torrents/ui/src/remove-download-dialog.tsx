import { useT } from '@kroma/module-sdk';
import { Dialog, Text } from '@kroma/ui/kit';
import { type CSSProperties, useState } from 'react';
import type { DownloadView } from './schemas';

const WIPE_ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  cursor: 'pointer',
};

const WIPE_BOX: CSSProperties = { width: 16, height: 16, accentColor: 'var(--kroma-danger)' };

interface RemoveDownloadDialogProps {
  dl: DownloadView;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (options: { deleteData: boolean }) => void;
}

export function RemoveDownloadDialog({
  dl,
  busy,
  onCancel,
  onConfirm,
}: Readonly<RemoveDownloadDialogProps>) {
  const t = useT();
  const [wipeData, setWipeData] = useState(true);
  return (
    <Dialog.Root open title={t('downloads.removeTitle')} onClose={onCancel} width="sm">
      <Text variant="meta" color="text/70">
        {t('downloads.removeBody', { title: dl.title })}
      </Text>
      <label style={WIPE_ROW}>
        <input
          type="checkbox"
          checked={wipeData}
          onChange={(e) => setWipeData(e.target.checked)}
          style={WIPE_BOX}
        />
        <Text variant="label" color="text/80">
          {t('downloads.removeData')}
        </Text>
      </label>
      <Dialog.Actions
        onCancel={onCancel}
        cancelLabel={t('common.cancel')}
        onConfirm={() => onConfirm({ deleteData: wipeData })}
        confirmLabel={t('downloads.removeConfirm')}
        busy={busy}
      />
    </Dialog.Root>
  );
}
