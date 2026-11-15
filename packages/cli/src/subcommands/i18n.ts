import { defineCommand } from 'citty';

export const i18n = defineCommand({
  meta: {
    name: 'i18n',
    description:
      'Translations: how far each language has come, what is left, typed keys. `kroma i18n help` lists the commands.',
  },
  run: async ({ rawArgs }) => {
    const { i18nCommand } = await import('../commands/i18n');
    try {
      process.exitCode = await i18nCommand({ argv: rawArgs });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  },
});
