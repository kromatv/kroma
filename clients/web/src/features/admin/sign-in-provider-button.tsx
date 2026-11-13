import { useT } from '@kromatv/ui';
import { Field, hasGlyph, Row, Select, Text } from '@kromatv/ui/kit';
import {
  PRESET_NOTES,
  PROVIDER_ICONS,
  type PresetCatalog,
  type ProviderForm,
  presetOf,
  presetPatch,
} from '#web/features/admin/sign-in-form';
import { ProviderMark } from '#web/shared/ui/provider-mark';

const OTHER = 'other';

/** What a provider's button looks like: which provider it is, the name it
 * reads, and an icon when it has no mark. Choosing a provider fills the rest
 * of the form with what that provider starts from. */
export function ButtonFields({
  provider: p,
  catalog,
  set,
}: Readonly<{
  provider: ProviderForm;
  catalog: PresetCatalog;
  set: (patch: Partial<ProviderForm>) => void;
}>) {
  const t = useT();
  const preset = presetOf(catalog, p.preset);
  const note = PRESET_NOTES[p.preset];

  return (
    <>
      <Text variant="overline" color="textDim" mb={12}>
        {t('admin.signInSectionButton')}
      </Text>

      <Row wrap gap={16} align="flex-start">
        <Field.Root label={t('admin.signInPreset')} flex minW={220} maxW={320}>
          <Select.Root
            label={t('admin.signInPreset')}
            value={preset ? preset.id : OTHER}
            onValueChange={(id) => set(presetPatch(p, preset, presetOf(catalog, id)))}
          >
            <Select.Trigger block />
            {catalog.map((known) => (
              <Select.Item key={known.id} value={known.id} label={known.name}>
                <Select.Media>
                  <ProviderMark icon={known.icon} image={known.logo} size={18} />
                </Select.Media>
              </Select.Item>
            ))}
            <Select.Item value={OTHER} icon="key">
              {t('admin.signInPresetOther')}
            </Select.Item>
          </Select.Root>
          <Field.Hint>{note ? t(note) : t('admin.signInPresetHint')}</Field.Hint>
        </Field.Root>

        <Field.Root label={t('admin.signInName')} flex minW={220} maxW={320}>
          <Field.Input
            icon="tag"
            value={p.label}
            onValueChange={(label) => set({ label })}
            placeholder={t('admin.signInNamePlaceholder')}
          />
          <Field.Hint>{t('admin.signInNameHint')}</Field.Hint>
        </Field.Root>

        {preset ? null : (
          <Field.Root label={t('admin.signInIcon')} w={200}>
            <Select.Root
              label={t('admin.signInIcon')}
              value={hasGlyph(p.icon) ? p.icon : 'key'}
              onValueChange={(icon) => set({ icon })}
            >
              <Select.Trigger block />
              {PROVIDER_ICONS.map((choice) => (
                <Select.Item key={choice.icon} value={choice.icon} icon={choice.icon}>
                  {t(choice.labelKey)}
                </Select.Item>
              ))}
            </Select.Root>
          </Field.Root>
        )}
      </Row>
    </>
  );
}
