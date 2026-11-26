import { type NativeModule, requireOptionalNativeModule } from 'expo';
import { z } from 'zod';

declare class AppLanguageNativeModule extends NativeModule {
  readonly reach: unknown;
  set(tag: string): Promise<void>;
}

const Reach = z.enum(['set', 'open', 'none']).catch('none');

/** What the app can do with the language the system's settings keep for it:
 *  `set` it (Android 13 and later), only `open` the page that holds it (iOS),
 *  or nothing where there is `none` (older Android, a build without the
 *  native half). */
export type SystemLanguageReach = z.infer<typeof Reach>;

const native = requireOptionalNativeModule<AppLanguageNativeModule>('AppLanguage');

export const systemLanguageReach: SystemLanguageReach = Reach.parse(native?.reach);

/** Hands a language to the system's own setting for the app where the app may
 *  `set` it, and does nothing elsewhere. Android applies it as a
 *  configuration change, after which the app's locale list leads with it. */
export async function setSystemLanguage(tag: string): Promise<void> {
  if (native && systemLanguageReach === 'set') {
    await native.set(tag);
  }
}
