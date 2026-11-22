import type { ImportSignInId } from '@kromatv/client/importers';
import type { ModuleId } from '@kromatv/client/modules';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

/** The imports the server ran, each with the sign-in it still holds. */
export const IMPORTS_QUERY = ['import', 'imports'] as const;

/** One sign-in, by the importer that keeps it. */
export interface KeptSignInRef {
  importer: ModuleId;
  signIn: ImportSignInId;
}

/** Has the importer delete a sign-in it keeps, then asks the imports again,
 * since none of them holds it any more. */
export function useForgetSignIn() {
  const { client } = useWebRuntime();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ importer, signIn }: KeptSignInRef) => client.importers.forget(importer, signIn),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: IMPORTS_QUERY }),
  });
}
