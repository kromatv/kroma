// The console's access-denied panel, shared by every admin page that gates on
// a capability.

import { useT } from '@kroma/ui';
import { Box, Surface, Text } from '@kroma/ui/kit';

export function Denied() {
  const t = useT();
  return (
    <Box center px={24} style={{ minHeight: '60vh' as unknown as number }}>
      <Surface pad="lg" elevated align="center" gap={8}>
        <Text variant="h2">{t('admin.accessDenied')}</Text>
        <Text variant="body" color="textDim">
          {t('admin.sectionDenied')}
        </Text>
      </Surface>
    </Box>
  );
}
