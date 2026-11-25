/** The props that say which language a string is written in, so the browser
 *  shapes its glyphs and reads it in that language's voice. */
export function languageProps(lang: string): { lang: string } {
  return { lang };
}
