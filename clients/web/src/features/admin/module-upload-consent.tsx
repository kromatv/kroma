import type { StoreBundleInspection } from '@kromatv/client/modules';
import { useT } from '@kromatv/ui';
import { Dialog } from '@kromatv/ui/kit';
import { createCallable } from 'react-call';
import { useModuleData } from '#web/features/admin/module-data';
import { ConsentSummary } from '#web/features/admin/module-permissions-consent';
import { consentOf } from '#web/features/admin/module-permissions-sources';

/** What an uploaded `.kmod` declares, for the operator to accept before it is
 *  installed. An upload names no registry, so it never counts as official. */
export const UploadConsentModal = createCallable<{ bundle: StoreBundleInspection }, boolean>(
  ({ call, bundle }) => {
    const t = useT();
    const { modules } = useModuleData();
    const consent = consentOf([{ ...bundle, official: false }], bundle.id, modules ?? []);
    return (
      <Dialog.Root
        open
        title={t('admin.modulesUploadTitle', { name: bundle.name, version: bundle.version })}
        onClose={() => call.end(false)}
        width="md"
      >
        <Dialog.Panel>
          <ConsentSummary {...consent} />
        </Dialog.Panel>
        <Dialog.Footer>
          <Dialog.Actions
            onCancel={() => call.end(false)}
            cancelLabel={t('common.cancel')}
            onConfirm={() => call.end(true)}
            confirmLabel={t('admin.modulesInstall')}
          />
        </Dialog.Footer>
      </Dialog.Root>
    );
  },
);
