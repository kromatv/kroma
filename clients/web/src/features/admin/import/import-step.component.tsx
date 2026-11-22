import { ImportConnect } from '#web/features/admin/import/import-connect.component';
import { ImportConsent } from '#web/features/admin/import/import-consent.component';
import { ImportReview } from '#web/features/admin/import/import-review.component';
import { ImportRun } from '#web/features/admin/import/import-run.component';
import { ImportServers } from '#web/features/admin/import/import-servers.component';
import { useImportSession } from '#web/features/admin/import/import-session.component';
import { ImportSource } from '#web/features/admin/import/import-source.component';
import { useImporter } from '#web/features/admin/import/use-importers.hook';

interface ImportStepProps {
  onBack?: () => void;
  onSkip?: () => void;
  onContinue: () => void;
}

/** Bringing another media server over, one question at a time: which server,
 * what its importer may do when the server does not hold it yet, the sign-in,
 * which of its servers, and what comes over. Each answer is kept, so the owner
 * comes back to where they were. The same screens run in the setup and in the
 * admin console, inside a `GuidedFlow.Root`. */
export function ImportStep({ onBack, onSkip, onContinue }: Readonly<ImportStepProps>) {
  const { session, update, restart } = useImportSession();
  const importer = useImporter(session.importer);
  if (session.running) {
    return <ImportRun id={session.running} onContinue={onContinue} />;
  }
  if (!session.importer || !importer) {
    return <ImportSource onBack={onBack} onSkip={onSkip} />;
  }
  if (!importer.installed) {
    return <ImportConsent importer={importer} onBack={restart} />;
  }
  if (!session.signIn) {
    return <ImportConnect importer={importer} onBack={restart} />;
  }
  if (!session.server) {
    return <ImportServers onBack={restart} />;
  }
  const target = { importer: session.importer, signIn: session.signIn, server: session.server };
  const back = session.servers.length > 1 ? () => update({ server: null }) : restart;
  return <ImportReview target={target} onBack={back} />;
}
