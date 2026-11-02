import type { StoreBundleInspection } from '@kromatv/client/modules';
import { useT } from '@kromatv/ui';
import { Button, Dialog } from '@kromatv/ui/kit';
import { createCallable } from 'react-call';
import { ConsentNotes } from '#web/features/admin/module-permissions-list';

/** What an uploaded `.kmod` declares, for the operator to accept before it is
 *  installed. An upload names no registry, so it never counts as official. */
export const UploadConsentModal = createCallable<{ bundle: StoreBundleInspection }, boolean>(
  ({ call, bundle }) => {
    const t = useT();
    return (
      <Dialog.Root
        open
        title={t('admin.modulesUploadTitle', { name: bundle.name, version: bundle.version })}
        onClose={() => call.end(false)}
        width="md"
      >
        <ConsentNotes
          name={bundle.name}
          permissions={bundle.permissions}
          widens={bundle.widensPermissions}
          official={false}
        />
        <Dialog.Actions>
          <Button
            variant="ghost"
            size="sm"
            label={t('common.cancel')}
            onPress={() => call.end(false)}
          />
          <Button
            variant="primary"
            size="sm"
            label={t('admin.modulesInstall')}
            onPress={() => call.end(true)}
          />
        </Dialog.Actions>
      </Dialog.Root>
    );
  },
);
