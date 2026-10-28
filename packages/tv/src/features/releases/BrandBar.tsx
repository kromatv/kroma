import { useT } from '@kromatv/ui';
import type { ReactNode } from 'react';
import { BackButton, Box } from '@kromatv/ui/kit';
import { useNav } from '#tv/app/router';
import { KromaMark, WallClock } from '#tv/shared/ui';

export function BrandBar({ children }: Readonly<{ children?: ReactNode }>) {
  const t = useT();
  const nav = useNav();
  return (
    <Box row align="center" justify="space-between" px={64} pt={34}>
      <Box row align="center" gap={16} flex>
        {nav.canGoBack ? <BackButton onPress={nav.back} label={t('common.back')} /> : null}
        <KromaMark size={28} />
        {children}
      </Box>
      <WallClock />
    </Box>
  );
}
