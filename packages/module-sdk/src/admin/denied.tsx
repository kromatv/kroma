// The console's access-denied panel, shared by every admin page that gates on
// a capability.

import { useT } from '@kroma/ui';
import { Box, Surface, styles, Text } from '@kroma/ui/kit';

const s = styles({ panel: { minHeight: '60vh' } });

export function Denied() {
  const t = useT();
  return (
    <Box center px={24} style={s.panel}>
      <Surface pad="lg" elevated align="center" gap={8}>
        <Text variant="h2">{t('modules.accessDenied')}</Text>
        <Text variant="body" color="textDim">
          {t('modules.sectionDenied')}
        </Text>
      </Surface>
    </Box>
  );
}
