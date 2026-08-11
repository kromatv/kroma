import { useState } from 'react';
import { z } from 'zod';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Text } from '#ui/components/atoms/text';
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
 * `<Field.Root>`. The port shows the other half of the schema: what is typed is
 * text, what `onSubmit` receives is a number.
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
  const name = form.field('name');
  const address = form.field('address');
  const port = form.field('port');

  const clear = () => {
    setSaved(null);
    form.reset();
  };

  return (
    <Box w={380} gap={18}>
      <Field.Root label="Name" {...name.root}>
        <Field.Input placeholder="Living room" physicalKeyboard {...name.input} />
      </Field.Root>
      <Box row gap={14}>
        <Field.Root label="Address" grow={1} {...address.root}>
          <Field.Input
            icon="server"
            placeholder="kroma.local"
            physicalKeyboard
            {...address.input}
          />
        </Field.Root>
        <Field.Root label="Port" w={110} {...port.root}>
          <Field.Input physicalKeyboard {...port.input} />
        </Field.Root>
      </Box>

      <Field.Root label="Quality" error={form.errors.quality}>
        <Select.Root
          label="Quality"
          value={form.values.quality}
          onValueChange={(next) => form.setValue('quality', next)}
        >
          <Select.Trigger block invalid={Boolean(form.errors.quality)} />
          {QUALITY.map((quality) => (
            <Select.Item key={quality.value} value={quality.value}>
              {quality.label}
            </Select.Item>
          ))}
        </Select.Root>
      </Field.Root>

      <Box row gap={14}>
        <Box grow={1}>
          <Button label="Add" block loading={form.submitting} onPress={form.submit} />
        </Box>
        <Button label="Clear" variant="outline" onPress={clear} />
      </Box>

      {saved ? (
        <Text variant="meta" color="success">
          {`Added ${saved}. Nothing was sent anywhere.`}
        </Text>
      ) : null}
    </Box>
  );
}
