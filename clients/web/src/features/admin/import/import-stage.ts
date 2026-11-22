import type { Importer } from '@kromatv/client/importers';
import type { ImportChoices } from '#web/features/admin/import/import-session.component';

/** The four stretches of an import, in the order the owner goes through them. */
export const IMPORT_STAGES = ['source', 'connect', 'review', 'run'] as const;

export type ImportStage = (typeof IMPORT_STAGES)[number];

/** Which stretch the screen `ImportStep` draws belongs to. Consenting to an
 * importer, signing in and picking a server are all the sign-in's. */
export function importStage(session: ImportChoices, importer: Importer | null): ImportStage {
  if (session.running) {
    return 'run';
  }
  if (!session.importer || !importer) {
    return 'source';
  }
  if (!importer.installed || !session.signIn || !session.server) {
    return 'connect';
  }
  return 'review';
}

/** The stretches the owner is past. */
export function stagesBehind(stage: ImportStage): ImportStage[] {
  return IMPORT_STAGES.slice(0, IMPORT_STAGES.indexOf(stage));
}

/** What the owner chose in each stretch, by the name they know it under. */
export function stageChoices(
  session: ImportChoices,
  importer: Importer | null,
): Partial<Record<ImportStage, string>> {
  const server = session.servers.find((one) => one.id === session.server);
  return {
    source: importer ? (importer.label ?? importer.name) : undefined,
    connect: server?.name,
  };
}
