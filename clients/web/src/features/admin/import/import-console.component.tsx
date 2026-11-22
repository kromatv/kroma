import { useT } from '@kromatv/ui';
import { Box, Section, useBreakpoint } from '@kromatv/ui/kit';
import { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { ConsoleFrame } from '#web/features/admin/import/import-frame.component';
import { KeptSignIns } from '#web/features/admin/import/import-kept-sign-ins.component';
import { useImportSession } from '#web/features/admin/import/import-session.component';
import { ImportStages, ImportStatus } from '#web/features/admin/import/import-stages.component';
import { ImportStep } from '#web/features/admin/import/import-step.component';
import { ADMIN_RAIL_WIDTH } from '#web/features/admin/web-style';

type Fit = 'rail' | 'bar' | 'line';

const GAP = 28;
const RAIL_MIN = 900;
const BAR_MIN = 600;

const GUESS = {
  base: 'line',
  md: 'bar',
  lg: 'rail',
  tv: 'rail',
} as const satisfies Record<ReturnType<typeof useBreakpoint>, Fit>;

function fitFor(width: number): Fit {
  if (width >= RAIL_MIN) {
    return 'rail';
  }
  return width >= BAR_MIN ? 'bar' : 'line';
}

function useFit() {
  const guess = GUESS[useBreakpoint()];
  const [width, setWidth] = useState<number | null>(null);
  const measure = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  return { fit: width === null ? guess : fitFor(width), measure };
}

function RailStages() {
  const t = useT();
  return (
    <Section.Root>
      <Section.Header>
        <Section.Title>{t('admin.importStages')}</Section.Title>
      </Section.Header>
      <ImportStages orientation="vertical" />
    </Section.Root>
  );
}

function StagesOver({ fit }: Readonly<{ fit: Fit }>) {
  if (fit === 'bar') {
    return <ImportStages orientation="horizontal" />;
  }
  return fit === 'line' ? <ImportStatus /> : null;
}

/** The import in the admin console, laid out for the page's room: the screen
 * the owner is on in a card, and beside it, where there is room, how far the
 * import has come and the sign-ins KROMA keeps. Where there is not, where it
 * stands runs over the card and the sign-ins come under it. */
export function ImportConsole() {
  const t = useT();
  const { restart } = useImportSession();
  const { fit, measure } = useFit();
  const sideBySide = fit === 'rail';
  return (
    <Box
      row={sideBySide}
      align={sideBySide ? 'flex-start' : 'stretch'}
      gap={GAP}
      onLayout={measure}
    >
      <Box flex={sideBySide} minW={0} gap={20}>
        <StagesOver fit={fit} />
        <ConsoleFrame label={t('admin.importTitle')}>
          <ImportStep onContinue={restart} />
        </ConsoleFrame>
      </Box>
      <Box w={sideBySide ? ADMIN_RAIL_WIDTH : undefined} shrink={0} gap={GAP}>
        {sideBySide ? <RailStages /> : null}
        <KeptSignIns />
      </Box>
    </Box>
  );
}
