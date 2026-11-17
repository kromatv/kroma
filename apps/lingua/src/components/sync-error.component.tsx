import { Callout } from '@kromatv/ui/kit/molecules/callout';

/** Why a project's `lingua.json` could not be read at its last sync. */
export function SyncError({ error }: Readonly<{ error: string }>) {
  return (
    <Callout.Root tone="danger" size="sm" icon="alert-triangle">
      <Callout.Title>lingua.json could not be read</Callout.Title>
      <Callout.Detail>{error}</Callout.Detail>
    </Callout.Root>
  );
}
