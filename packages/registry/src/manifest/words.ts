import { z } from 'zod';

/** A language as a manifest names it: `fr`, `pt-BR`. */
export const LanguageTag = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{1,8})*$/, 'not a language');

/** What a module says about itself in one language. A word left out reads in
 *  English, from the manifest's own field. */
export const ModuleWords = z.object({
  name: z.string().nullish(),
  description: z.string().nullish(),
  tagline: z.string().nullish(),
});
export type ModuleWords = z.infer<typeof ModuleWords>;

/** A module's words in each language it speaks besides English, by language. */
export const ModuleTranslations = z.record(LanguageTag, ModuleWords);
export type ModuleTranslations = z.infer<typeof ModuleTranslations>;
