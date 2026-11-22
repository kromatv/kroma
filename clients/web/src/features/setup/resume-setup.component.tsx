import { Navigate } from '@tanstack/react-router';
import { resumeAt, useSetupState } from '#web/shared/lib/setup-state';

/** Sends the owner back to the step they stopped on, on any browser, until
 * they leave the setup. Draws nothing for anyone else. */
export function ResumeSetup() {
  const address = resumeAt(useSetupState().data);
  return address ? <Navigate to="/setup" search={address} replace /> : null;
}
