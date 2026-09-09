import type { LibraryId } from '@kromatv/client/media';
import type { Translate } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, ChoiceList, Row, Switch, Text } from '@kromatv/ui/kit';
import { usePoll } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';

/** A member's library grant as a label. A named grant stays a count even when it
 * happens to name every library today: a library added tomorrow would not be in
 * it. */
export function accessLabel(granted: readonly LibraryId[] | null, t: Translate): string {
  if (granted === null) return t('admin.allLibraries');
  if (granted.length === 0) return t('admin.noLibraryGranted');
  return t('admin.libraryCount', { count: granted.length });
}

export function LibraryVisibility({
  granted,
  onChange,
}: Readonly<{
  granted: readonly LibraryId[] | null;
  onChange: (next: readonly LibraryId[] | null) => void;
}>) {
  const t = useT();
  const { client } = useAuth();
  const { data } = usePoll(['admin', 'libraries'], () => client.library.list(), 30000);
  const libraries = data?.libraries ?? [];

  return (
    <Box>
      <Text variant="overline" color="textDim" mb={8}>
        {t('admin.visibleLibraries')}
      </Text>
      <Row between gap={16}>
        <Box minW={0}>
          <Text variant="label">{t('admin.allLibraries')}</Text>
          <Text variant="meta" color="textDim" mt={2}>
            {t('admin.visibleLibrariesHint')}
          </Text>
        </Box>
        <Switch
          checked={granted === null}
          onCheckedChange={(every) => onChange(every ? null : [])}
          label={t('admin.allLibraries')}
        />
      </Row>
      {granted === null ? null : (
        <Box mt={12}>
          <ChoiceList.Root
            mode="multiple"
            size="sm"
            label={t('admin.visibleLibraries')}
            value={granted}
            onValueChange={(next) => onChange(next as LibraryId[])}
          >
            {libraries.map((lib) => (
              <ChoiceList.Item key={lib.id} value={lib.id}>
                <ChoiceList.Label>{lib.name}</ChoiceList.Label>
                <ChoiceList.Hint>{t('admin.itemsCount', { count: lib.itemCount })}</ChoiceList.Hint>
              </ChoiceList.Item>
            ))}
          </ChoiceList.Root>
          {libraries.length === 0 ? (
            <Text variant="meta" color="textDim">
              {t('admin.noLibraries')}
            </Text>
          ) : null}
        </Box>
      )}
    </Box>
  );
}
