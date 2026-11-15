// Mount points for the admin console's imperative modals: each callable needs
// exactly one host rendered while it can be called.
import { ExportModal, ImportModal } from '#web/features/admin/backup-modals';
import { StopStreamModal } from '#web/features/admin/dashboard-now-playing.component';
import { ScheduleModal } from '#web/features/admin/jobs-schedule.component';
import { AddLibraryModal, ManageLibraryModal } from '#web/features/admin/libraries-modals';
import { InstallModal } from '#web/features/admin/module-install.component';
import { PermissionsSheet } from '#web/features/admin/module-permissions-sheet.component';
import { UploadConsentModal } from '#web/features/admin/module-upload-consent.component';
import { RegistriesDrawer } from '#web/features/admin/module-registries.component';
import { PipelineDrawer } from '#web/features/admin/pipeline-drawer.component';
import { ReportDrawer } from '#web/features/admin/report-drawer.component';
import { ApproveJoinModal } from '#web/features/admin/users-approve-modal.component';
import { EditUserModal } from '#web/features/admin/users-edit-modal.component';
import { InviteModal } from '#web/features/admin/users-invite-modal.component';
import { MediaInfoModal } from '#web/shared/ui/media-info-modal.component';

export function AdminModalHosts() {
  return (
    <>
      <StopStreamModal />
      <EditUserModal />
      <ApproveJoinModal />
      <InviteModal />
      <ExportModal />
      <ImportModal />
      <AddLibraryModal />
      <ManageLibraryModal />
      <ScheduleModal />
      <PipelineDrawer />
      <ReportDrawer />
      <InstallModal />
      <UploadConsentModal />
      <PermissionsSheet />
      <RegistriesDrawer />
      {/* Lent to modules through `openMediaInfo` on the admin host. */}
      <MediaInfoModal />
    </>
  );
}
