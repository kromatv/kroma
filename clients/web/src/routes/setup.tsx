import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Setup } from '#web/features/setup/setup.component';
import {
  laterStep,
  readSetupStart,
  readSetupStep,
  type SetupStart,
  type SetupStep,
} from '#web/features/setup/setup-steps';

interface SetupSearch {
  step: SetupStep;
  start: SetupStart;
  reached: SetupStep;
}

export const Route = createFileRoute('/setup')({
  validateSearch: (search: Record<string, unknown>): SetupSearch => {
    const step = readSetupStep(search.step);
    return {
      step,
      start: readSetupStart(search.start),
      reached: laterStep(readSetupStep(search.reached), step),
    };
  },
  component: SetupPage,
});

function SetupPage() {
  const { step, start, reached } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <Setup
      step={step}
      start={start}
      reached={reached}
      onStep={(next) =>
        void navigate({
          to: '/setup',
          search: { step: next, start, reached: laterStep(reached, next) },
        })
      }
      onStart={(next) =>
        void navigate({ to: '/setup', search: { step, start: next, reached }, replace: true })
      }
      onLeave={() => void navigate({ to: '/' })}
    />
  );
}
