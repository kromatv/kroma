import { asApp, asInstallation } from '#site/github/app';
import { installations } from '#site/github/sync';
import { credentials, type Env, storeFor } from './env';
import { syncInstallation } from './webhook';

/** The cron's pass: find every repository the App reaches that has a `lingua.json`, then sync each one. */
export async function refreshAll(env: Env, now: number): Promise<void> {
  const app = credentials(env);
  if (!app || !env.LINGUA_DB) {
    return;
  }
  const store = await storeFor(env);
  const ids = await installations(await asApp(app));
  const passes = ids.map(async (id) => {
    try {
      await syncInstallation({ gh: await asInstallation(app, id), store }, id, now);
    } catch (error) {
      console.error(`lingua: installation ${id} did not sync`, error);
    }
  });
  await Promise.all(passes);
}
