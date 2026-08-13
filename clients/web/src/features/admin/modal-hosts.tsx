// Mount points for the admin console's imperative modals: each callable needs
// exactly one host rendered while it can be called.
import { AddEngineHost } from '@kroma/module-sdk';
import { ExportModal, ImportModal } from '#web/features/admin/backup-modals';
import { StopStreamModal } from '#web/features/admin/dashboard-now-playing';
import { ScheduleModal } from '#web/features/admin/jobs-schedule';
import { AddLibraryModal, ManageLibraryModal } from '#web/features/admin/libraries-modals';
import { InstallModal } from '#web/features/admin/module-install';
import { RegistriesDrawer } from '#web/features/admin/module-registries';
import { PipelineDrawer } from '#web/features/admin/pipeline-drawer';
import { ReportDrawer } from '#web/features/admin/report-drawer';
import { EditUserModal, InviteModal } from '#web/features/admin/users-modals';
import { MediaInfoModal } from '#web/shared/ui/media-info-modal';

export function AdminModalHosts() {
  return (
    <>
      <StopStreamModal />
      <EditUserModal />
      <InviteModal />
      <ExportModal />
      <ImportModal />
      <AddLibraryModal />
      <ManageLibraryModal />
      <ScheduleModal />
      <PipelineDrawer />
      <ReportDrawer />
      <InstallModal />
      <RegistriesDrawer />
      {/* Lent to modules through `openMediaInfo` on the admin host. */}
      <MediaInfoModal />
      {/* One host covers every module page (indexers, download clients). */}
      <AddEngineHost />
    </>
  );
}
