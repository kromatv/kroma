interface LanguagePreset {
  value: string;
  labelKey: string;
}

/** `original` is the title's own language rather than a tag. */
export const LANGUAGE_PRESETS: readonly LanguagePreset[] = [
  { value: 'original', labelKey: 'acq.langOriginal' },
  { value: 'fr-FR', labelKey: 'acq.langVff' },
  { value: 'fr-CA', labelKey: 'acq.langVfq' },
  { value: 'fr', labelKey: 'acq.langFrench' },
  { value: 'en', labelKey: 'acq.langEnglish' },
];

export function isLanguagePreset(value: string): boolean {
  return LANGUAGE_PRESETS.some((preset) => preset.value === value);
}
