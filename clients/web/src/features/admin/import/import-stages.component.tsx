import { useT } from '@kromatv/ui';
import { Box, Progress, Stepper, type StepperOrientation, Text } from '@kromatv/ui/kit';
import { useImportSession } from '#web/features/admin/import/import-session.component';
import {
  IMPORT_STAGES,
  type ImportStage,
  importStage,
  stageChoices,
  stagesBehind,
} from '#web/features/admin/import/import-stage';
import { useImporter } from '#web/features/admin/import/use-importers.hook';

const STAGE_NAME = {
  source: 'admin.importStageSource',
  connect: 'admin.importStageConnect',
  review: 'admin.importStageReview',
  run: 'admin.importStageRun',
} as const satisfies Record<ImportStage, string>;

function useStage() {
  const { session } = useImportSession();
  const importer = useImporter(session.importer);
  return { stage: importStage(session, importer), choices: stageChoices(session, importer) };
}

function StageItem({ stage, choice }: Readonly<{ stage: ImportStage; choice?: string }>) {
  const t = useT();
  return (
    <Stepper.Item value={stage} disabled>
      <Stepper.Label>{t(STAGE_NAME[stage])}</Stepper.Label>
      {choice ? <Stepper.Hint>{choice}</Stepper.Hint> : null}
    </Stepper.Item>
  );
}

/** Where the import stands: the four stretches it goes through and the one
 * the owner is in. Down a column, each stretch behind the owner also names
 * what they chose in it; across a row there is no room for that. It shows and
 * takes no press: the screen's own way back is the one that goes back. */
export function ImportStages({ orientation }: Readonly<{ orientation: StepperOrientation }>) {
  const t = useT();
  const { stage, choices } = useStage();
  const vertical = orientation === 'vertical';
  return (
    <Stepper.Root
      label={t('admin.importStages')}
      orientation={orientation}
      size={vertical ? 'md' : 'sm'}
      value={stage}
      complete={stagesBehind(stage)}
    >
      <Stepper.List>
        {IMPORT_STAGES.map((name) => (
          <StageItem key={name} stage={name} choice={vertical ? choices[name] : undefined} />
        ))}
      </Stepper.List>
    </Stepper.Root>
  );
}

/** Where the import stands in one line over a bar, for a page with no room
 * for the four stretches: `Step 2 of 4: Sign-in`. */
export function ImportStatus() {
  const t = useT();
  const { stage } = useStage();
  const position = IMPORT_STAGES.indexOf(stage) + 1;
  const count = IMPORT_STAGES.length;
  const where = t('flow.stepNamed', { position, count, name: t(STAGE_NAME[stage]) });
  return (
    <Box gap={10}>
      <Text variant="overline" color="textDim">
        {where}
      </Text>
      <Progress value={position / count} label={where} />
    </Box>
  );
}
