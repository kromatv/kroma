/** The props that say which language a string is written in, so the platform
 *  reads it in that language's voice. */
export function languageProps(lang: string): { accessibilityLanguage: string } {
  return { accessibilityLanguage: lang };
}
