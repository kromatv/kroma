import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { Stepper } from '#ui/components/molecules/stepper';
import { GuidedFlow } from './guided-flow.component';

const STEPS = [
  { value: 'library', name: 'Bibliothèque', icon: 'folder' },
  { value: 'people', name: 'Invitations', icon: 'users' },
  { value: 'privacy', name: 'Statistiques anonymes', icon: 'shield-check' },
] as const;

type Step = (typeof STEPS)[number]['value'];

function Steps({ step, onStep }: Readonly<{ step: Step; onStep: (next: Step) => void }>) {
  const go = (next: string) => {
    const found = STEPS.find((candidate) => candidate.value === next);
    if (found) {
      onStep(found.value);
    }
  };
  return (
    <Stepper.Root
      label="Configuration"
      orientation="vertical"
      size="sm"
      value={step}
      onValueChange={go}
    >
      <Stepper.List>
        {STEPS.map((each) => (
          <Stepper.Item key={each.value} value={each.value} icon={each.icon}>
            <Stepper.Label>{each.name}</Stepper.Label>
          </Stepper.Item>
        ))}
      </Stepper.List>
    </Stepper.Root>
  );
}

function Moves({ step, onStep }: Readonly<{ step: Step; onStep: (next: Step) => void }>) {
  const at = STEPS.findIndex((each) => each.value === step);
  const forward = STEPS[at + 1]?.value;
  const back = STEPS[at - 1]?.value;
  return (
    <GuidedFlow.Footer>
      {back ? <GuidedFlow.Previous onPress={() => onStep(back)} /> : null}
      <GuidedFlow.Actions>
        <GuidedFlow.Next
          label={forward ? undefined : 'Terminer'}
          onPress={() => onStep(forward ?? 'library')}
        />
      </GuidedFlow.Actions>
    </GuidedFlow.Footer>
  );
}

/**
 * A whole flow on a wide screen. With room for it the steps stand beside the
 * question, and the position over the question is not drawn: the frame keeps
 * one height from screen to screen, so the actions never move. Every step the
 * flow has been to is one press away in the list.
 *
 * @name On a wide screen
 */
export default function OnAWideScreen() {
  const [step, setStep] = useState<Step>('library');
  const at = STEPS.findIndex((each) => each.value === step);
  const name = STEPS[at]?.name;
  return (
    <Box w={960} h={760} p={24} justify="center">
      <GuidedFlow.Root label="Configuration">
        <GuidedFlow.Aside>
          <Steps step={step} onStep={setStep} />
        </GuidedFlow.Aside>
        <GuidedFlow.Status position={at + 1} count={STEPS.length}>
          {name}
        </GuidedFlow.Status>
        <GuidedFlow.Header>
          <GuidedFlow.Title>{name}</GuidedFlow.Title>
        </GuidedFlow.Header>
        <GuidedFlow.Panel>
          <Text color="textMuted">Une question par écran, et rien d'autre.</Text>
        </GuidedFlow.Panel>
        <Moves step={step} onStep={setStep} />
      </GuidedFlow.Root>
    </Box>
  );
}
