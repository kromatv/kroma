import { useQueryClient } from '@tanstack/react-query';
import { OFFERS_QUERY } from '#web/features/setup/module-offers';
import { useSetupPicks } from '#web/features/setup/setup-picks.component';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

/** Applies what the owner chose on the modules step: it installs the modules
 * they selected and uninstalls the ones they deselected. Nothing happens
 * before the owner leaves the setup, so a choice stays a choice, and the owner
 * changes it for as long as they are in the setup. An uninstall keeps the
 * module's settings. */
export function useInstallPicks(): () => void {
  const { moduleApi } = useWebRuntime();
  const queryClient = useQueryClient();
  const { picked, dropped, start, giveUp } = useSetupPicks();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: OFFERS_QUERY });
  };
  return () => {
    for (const id of picked) {
      void moduleApi
        .installById(id)
        .catch(() => giveUp(id))
        .finally(refresh);
    }
    for (const id of dropped) {
      void moduleApi
        .uninstallModule(id)
        .catch(() => undefined)
        .finally(refresh);
    }
    start();
  };
}
