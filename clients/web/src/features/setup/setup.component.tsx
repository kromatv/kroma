import { Navigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { DoneStep } from '#web/features/setup/done-step.component';
import { ImportSession } from '#web/features/setup/import-session.component';
import { ImportStep } from '#web/features/setup/import-step.component';
import { LanguageStep } from '#web/features/setup/language-step.component';
import { MediaStep } from '#web/features/setup/media-step.component';
import { ModulesStep } from '#web/features/setup/modules-step.component';
import { OwnerStep } from '#web/features/setup/owner-step.component';
import { PeopleStep } from '#web/features/setup/people-step.component';
import { PrivacyStep } from '#web/features/setup/privacy-step.component';
import type { ScanFeed } from '#web/features/setup/scan-feed';
import { SetupPicks } from '#web/features/setup/setup-picks.component';
import { SetupShell } from '#web/features/setup/setup-shell.component';
import {
  type SetupStart,
  type SetupStep,
  type SetupVisitor,
  stepAfter,
  stepBefore,
  stepOpenTo,
  stepsUpTo,
} from '#web/features/setup/setup-steps';
import { StartStep } from '#web/features/setup/start-step.component';
import { useInstallPicks } from '#web/features/setup/use-install-picks.hook';
import { useScanFeed } from '#web/features/setup/use-scan-feed.hook';
import { useServerOwner } from '#web/features/setup/use-server-owner.hook';
import { useAuth } from '#web/shared/lib/auth';

interface SetupProps {
  step: SetupStep;
  start: SetupStart;
  /** The furthest step the owner has been to. */
  reached: SetupStep;
  onStep: (step: SetupStep) => void;
  onStart: (start: SetupStart) => void;
  onLeave: () => void;
}

type FlowProps = SetupProps & { visitor: SetupVisitor };

interface Moves {
  feed: ScanFeed;
  start: SetupStart;
  onStart: (start: SetupStart) => void;
  next: () => void;
  back: () => void;
  leave: () => void;
}

const VIEWS: Record<SetupStep, (moves: Moves) => ReactNode> = {
  language: ({ next }) => <LanguageStep onContinue={next} />,
  start: ({ start, onStart, next, back }) => (
    <StartStep start={start} onStart={onStart} onBack={back} onContinue={next} />
  ),
  owner: ({ next, back }) => <OwnerStep onBack={back} onCreated={next} />,
  import: ({ next, back }) => <ImportStep onBack={back} onContinue={next} />,
  media: ({ feed, next, back }) => <MediaStep feed={feed} onBack={back} onContinue={next} />,
  modules: ({ next, back }) => <ModulesStep onBack={back} onContinue={next} />,
  people: ({ next, back }) => <PeopleStep onBack={back} onContinue={next} />,
  privacy: ({ next, back }) => <PrivacyStep onBack={back} onContinue={next} />,
  done: ({ leave }) => <DoneStep onOpen={leave} />,
};

function openSteps({ reached, visitor, start }: FlowProps): SetupStep[] {
  return stepsUpTo(reached, start).filter(
    (visited) => stepOpenTo(visited, visitor, start) === visited,
  );
}

/** The guided setup a new owner is led through, one decision per screen. A
 * visitor who is not signed in sees it only on a server nobody owns yet. */
export function Setup(props: Readonly<SetupProps>) {
  const { ready, user } = useAuth();
  const owner = useServerOwner();
  if (!ready || (!user && owner === 'unknown')) {
    return null;
  }
  if (!user && owner === 'present') {
    return <Navigate to="/login" replace />;
  }
  return (
    <SetupPicks>
      <ImportSession>
        <SetupFlow {...props} visitor={user ? 'owner' : 'stranger'} />
      </ImportSession>
    </SetupPicks>
  );
}

function useMoves({ step, start, onStep, onStart, onLeave }: FlowProps & { step: SetupStep }) {
  const feed = useScanFeed();
  const install = useInstallPicks();
  const ends = (to: SetupStep) => {
    if (to === 'done') {
      install();
    }
  };
  const next = () => {
    ends(stepAfter(step, start));
    onStep(stepAfter(step, start));
  };
  const leave = () => {
    ends('done');
    onLeave();
  };
  const back = () => onStep(stepBefore(step, start) ?? step);
  return { feed, start, onStart, next, back, leave };
}

function SetupFlow(props: Readonly<FlowProps>) {
  const step = stepOpenTo(props.step, props.visitor, props.start);
  const moves = useMoves({ ...props, step });
  return (
    <SetupShell
      step={step}
      start={props.start}
      reached={props.reached}
      open={openSteps(props)}
      posters={moves.feed.posters}
      onStep={props.onStep}
      onFinishLater={moves.leave}
    >
      {VIEWS[step](moves)}
    </SetupShell>
  );
}
