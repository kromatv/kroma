import type { Importer, ImportSignIn } from '@kromatv/client/importers';
import { useT } from '@kromatv/ui';
import { Box, Button, Icon, Row, Spinner, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { ImportRefused } from '#web/features/setup/import-refused.component';
import { ImporterIcon } from '#web/features/setup/importer-icon.component';
import { StepActions, StepBody } from '#web/features/setup/setup-shell.component';
import { openPage, useImportPageSignIn } from '#web/features/setup/use-import-sign-in.hook';

type StagePhase = 'ready' | 'opened';
type StageState = 'done' | 'now' | 'next';

interface ElsewhereProps {
  importer: Importer;
  onBack: () => void;
}

interface ForwardProps {
  name: string;
  answer: ImportSignIn | null;
  phase: StagePhase;
  onOpen: (url: string) => void;
  onAgain: () => void;
}

const STAGES = [
  'setup.importStageOpen',
  'setup.importStageApprove',
  'setup.importStageRead',
] as const;

const STATES: Record<StagePhase, StageState[]> = {
  ready: ['now', 'next', 'next'],
  opened: ['done', 'now', 'next'],
};

/** Where each of the three stages stands: before the owner opened the page of
 * the other server, and once it is open. */
export function stageStates(phase: StagePhase): StageState[] {
  return STATES[phase];
}

interface MarkProps {
  state: StageState;
  phase: StagePhase;
  order: number;
}

function StageMark({ state, phase, order }: Readonly<MarkProps>) {
  if (state === 'now' && phase === 'opened') {
    return <Spinner size={20} />;
  }
  if (state === 'done') {
    return (
      <Box w={24} h={24} radius="pill" center bg="success">
        <Icon name="check" size={14} color="bg" />
      </Box>
    );
  }
  return (
    <Box w={24} h={24} radius="pill" center bg={state === 'now' ? 'accentSoft' : 'tint/6'}>
      <Text variant="meta" color={state === 'now' ? 'accentText' : 'textDim'}>
        {order}
      </Text>
    </Box>
  );
}

function Stages({ name, phase }: Readonly<{ name: string; phase: StagePhase }>) {
  const t = useT();
  const states = stageStates(phase);
  return (
    <Box gap={14}>
      {STAGES.map((line, at) => (
        <Row key={line} align="center" gap={12}>
          <StageMark state={states[at] ?? 'next'} phase={phase} order={at + 1} />
          <Text color={states[at] === 'next' ? 'textDim' : 'text'} flex={1}>
            {t(line, { name })}
          </Text>
        </Row>
      ))}
    </Box>
  );
}

function Forward({ name, answer, phase, onOpen, onAgain }: Readonly<ForwardProps>) {
  const t = useT();
  if (answer?.status === 'refused') {
    return <Button size="md" icon="refresh" label={t('setup.importAgain')} onPress={onAgain} />;
  }
  const url = answer?.status === 'pending' ? answer.url : null;
  const opened = phase === 'opened';
  return (
    <Button
      variant={opened ? 'outline' : 'primary'}
      size="md"
      icon="external-link"
      label={opened ? t('setup.importPageAgain') : t('setup.importSignInWith', { name })}
      loading={url === null}
      onPress={() => (url ? onOpen(url) : undefined)}
    />
  );
}

/** The sign-in to a server that wants the owner on a page of its own. The way
 * there is ready when the screen shows, so one press opens it, and the screen
 * says where the sign-in stands until the owner has approved it there. */
export function ImportSignInElsewhere({ importer, onBack }: Readonly<ElsewhereProps>) {
  const { answer, again } = useImportPageSignIn(importer);
  const [phase, setPhase] = useState<StagePhase>('ready');
  const name = importer.label ?? importer.name;
  const open = (url: string) => {
    openPage(url);
    setPhase('opened');
  };
  const restart = () => {
    setPhase('ready');
    again();
  };
  return (
    <>
      <StepBody>
        <ImporterIcon importer={importer} size={64} />
        <Stages name={name} phase={phase} />
        <ImportRefused answer={answer} />
      </StepBody>
      <StepActions onBack={onBack}>
        <Forward name={name} answer={answer} phase={phase} onOpen={open} onAgain={restart} />
      </StepActions>
    </>
  );
}
