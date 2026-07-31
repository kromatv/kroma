import { useState } from 'react';
import { z } from 'zod';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Txt } from '#ui/components/atoms/text';
import { Field } from '#ui/components/molecules/field';
import { Select } from '#ui/components/molecules/select';
import { msg, useForm } from '#ui/lib/form';
import { useT } from '#ui/services/i18n';

const QUALITY = [
  { value: 'original', label: 'Original' },
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
];

const AddServer = z.object({
  name: z.string().min(1, msg('form.required')),
  address: z.string().min(1, msg('form.required')),
  // The entry is text and the parsed value is a number, so `field('port')` still
  // binds a string while `onSubmit` is handed the number.
  port: z.string().regex(/^\d+$/, msg('form.number')).transform(Number),
  quality: z.string().min(1, msg('form.required')),
});

/**
 * A `<Select>` is not a text entry, so it reads `form.values` and reports through
 * `form.setValue` - and still wears its label and error by sitting inside a
 * `<Field>`. The port shows the other half of the schema: what is typed is text,
 * what `onSubmit` receives is a number.
 *
 * @name Add a server
 */
export default function AddServerForm() {
  const [saved, setSaved] = useState<string | null>(null);

  const form = useForm({
    schema: AddServer,
    defaultValues: { name: '', address: '', port: '4040', quality: '' },
    t: useT(),
    onSubmit: ({ address, port }) => setSaved(`${address}:${port}`),
  });

  const clear = () => {
    setSaved(null);
    form.reset();
  };

  return (
    <Box w={380} gap={18}>
      <Field label="Name" placeholder="Living room" physicalKeyboard {...form.field('name')} />
      <Box row gap={14}>
        <Field
          label="Address"
          icon="server"
          placeholder="kroma.local"
          physicalKeyboard
          grow={1}
          {...form.field('address')}
        />
        <Field label="Port" w={110} physicalKeyboard {...form.field('port')} />
      </Box>

      <Field label="Quality" error={form.errors.quality}>
        <Select
          label="Quality"
          options={QUALITY}
          value={form.values.quality}
          onChange={(next) => form.setValue('quality', next)}
          invalid={Boolean(form.errors.quality)}
        />
      </Field>

      <Box row gap={14}>
        <Box grow={1}>
          <Button label="Add" block loading={form.submitting} onPress={form.submit} />
        </Box>
        <Button label="Clear" variant="outline" onPress={clear} />
      </Box>

      {saved ? (
        <Txt variant="meta" color="success">
          {`Added ${saved}. Nothing was sent anywhere.`}
        </Txt>
      ) : null}
    </Box>
  );
}
