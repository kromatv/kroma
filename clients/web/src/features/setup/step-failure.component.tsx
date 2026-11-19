import { Callout } from '@kromatv/ui/kit';

/** What went wrong on a step, in the step's own words. It draws nothing while
 * nothing went wrong. */
export function StepFailure({ error }: Readonly<{ error: string | null }>) {
  if (!error) {
    return null;
  }
  return (
    <Callout.Root tone="danger" icon="alert-triangle">
      <Callout.Title>{error}</Callout.Title>
    </Callout.Root>
  );
}
