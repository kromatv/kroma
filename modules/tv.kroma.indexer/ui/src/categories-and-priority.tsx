import { useT } from '@kroma/module-sdk';
import { Box, Field } from '@kroma/ui/kit';

export function CategoriesAndPriority({
  cats,
  onCatsChange,
  priority,
  onPriorityChange,
}: Readonly<{
  cats: string;
  onCatsChange: (value: string) => void;
  priority: string;
  onPriorityChange: (value: string) => void;
}>) {
  const t = useT();
  return (
    <Box row={{ base: false, md: true }} gap={16}>
      <Field.Root flex label={t('indexers.categories')} value={cats} onValueChange={onCatsChange}>
        <Field.Hint>{t('indexers.categoriesHint')}</Field.Hint>
      </Field.Root>
      <Field.Root
        flex
        label={t('indexers.priority')}
        value={priority}
        onValueChange={onPriorityChange}
      >
        <Field.Hint>{t('indexers.priorityHint')}</Field.Hint>
      </Field.Root>
    </Box>
  );
}
