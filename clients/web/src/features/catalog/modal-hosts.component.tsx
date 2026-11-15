// Mount points for the catalog feature's imperative modals (react-call). Each
// callable needs exactly one Root rendered while it can be called; hosting them
// here (mounted by the authenticated `_app` layout) lets every call site drop
// its `useState(open)` + conditional render in favour of `await Modal.call(props)`.

import { RematchDialog } from '#web/features/catalog/rematch-dialog.component';
import { ReportDialog } from '#web/features/catalog/report-dialog.component';
import { MediaInfoModal } from '#web/shared/ui/media-info-modal.component';

export function CatalogModalHosts() {
  return (
    <>
      <MediaInfoModal />
      <RematchDialog />
      <ReportDialog />
    </>
  );
}
