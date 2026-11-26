import { Callout } from '@kromatv/ui/kit';

interface StepFailureProps {
  error: string | null;
  detail?: string | null;
}

/** What went wrong on a step, in the step's own words, and under it the cause
 * the server gave when it gave one. It draws nothing while nothing went wrong. */
export function StepFailure({ error, detail }: Readonly<StepFailureProps>) {
  if (!error) {
    return null;
  }
  return (
    <Callout.Root tone="danger" icon="alert-triangle">
      <Callout.Title>{error}</Callout.Title>
      {detail ? <Callout.Detail>{detail}</Callout.Detail> : null}
    </Callout.Root>
  );
}
