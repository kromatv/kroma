import { ImportConnect } from '#web/features/setup/import-connect.component';
import { ImportReview } from '#web/features/setup/import-review.component';
import { ImportRun } from '#web/features/setup/import-run.component';
import { ImportServers } from '#web/features/setup/import-servers.component';
import { useImportSession } from '#web/features/setup/import-session.component';
import { ImportSource } from '#web/features/setup/import-source.component';
import { useImporter } from '#web/features/setup/use-importers.hook';

interface ImportStepProps {
  onBack: () => void;
  onContinue: () => void;
}

/** Bringing another media server over, one question at a time: which server,
 * the sign-in to it, which of its servers, and what comes over. Each answer
 * is kept, so the owner comes back to where they were. */
export function ImportStep({ onBack, onContinue }: Readonly<ImportStepProps>) {
  const { session, update, restart } = useImportSession();
  const importer = useImporter(session.importer);
  if (session.running) {
    return <ImportRun id={session.running} onContinue={onContinue} />;
  }
  if (!session.importer || !importer) {
    return <ImportSource onBack={onBack} onSkip={onContinue} />;
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
