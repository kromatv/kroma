import { hasPermission } from '@kromatv/client/accounts';
import type { SetupAnswer, SetupState, SetupStep } from '@kromatv/client/setup';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '#web/shared/lib/auth';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

/** The cache entry every screen reads the owner's setup from. */
export const SETUP_STATE_QUERY = ['setup', 'state'] as const;

/** The setup of the signed-in owner, as the server keeps it. Only an account
 * that manages the server asks: the setup leads its owner and nobody else. */
export function useSetupState() {
  const { client } = useWebRuntime();
  const { user } = useAuth();
  return useQuery({
    queryKey: SETUP_STATE_QUERY,
    queryFn: () => client.setup.state(),
    enabled: !!user && hasPermission(user, 'settings.manage'),
  });
}

/** Keeps a setup the server answered as the one every screen reads. */
export function useSetupAnswered(): (answer: SetupAnswer) => void {
  const queryClient = useQueryClient();
  return (answer) => {
    queryClient.setQueryData(SETUP_STATE_QUERY, answer);
  };
}

/** The address of `step` in `setup`, the step the owner stopped on by default. */
export function setupAddress(setup: SetupState, step: SetupStep = setup.step) {
  return { step, start: setup.start, reached: setup.reached };
}

/** Where the owner goes back to: the step they stopped on, while their setup
 * runs. Nowhere once they left it, and for anyone it does not lead. */
export function resumeAt(answer: SetupAnswer | undefined) {
  const setup = answer?.setup;
  return setup && !setup.ended ? setupAddress(setup) : null;
}
