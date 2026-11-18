/** A language's name in that language, as a person looking for theirs reads
 * it: "Français" for `fr`, whatever the interface speaks now. */
export function nativeLanguageName(code: string): string {
  const name = new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
  return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
}
