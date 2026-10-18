import { useT } from '@kromatv/ui';
import { Box, Button, classes, Row, styles, Text } from '@kromatv/ui/kit';
import { useState } from 'react';

const STAY_MS = 6000;

interface Notice {
  text: string;
  undo: (() => void) | null;
}

export interface MonitoringNoticeState {
  notice: Notice;
  on: boolean;
  say: (text: string, undo?: () => void) => void;
}

export function useMonitoringNotice(): MonitoringNoticeState {
  const [notice, setNotice] = useState<Notice>({ text: '', undo: null });
  const [on, setOn] = useState(false);
  const say = (text: string, undo?: () => void) => {
    setNotice({ text, undo: undo ?? null });
    setOn(true);
    window.setTimeout(() => setOn(false), STAY_MS);
  };
  return { notice, on, say };
}

export function MonitoringNotice({
  notice,
  on,
  lifted = false,
}: Readonly<Pick<MonitoringNoticeState, 'notice' | 'on'> & { lifted?: boolean }>) {
  const t = useT();
  return (
    <div
      className={classes(s.bar, lifted ? s.lifted : null, on ? s.shown : s.hidden)}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-hidden={!on}
    >
      <Row
        gap={14}
        align="center"
        px={18}
        py={10}
        radius="pill"
        bg="surface2"
        border="borderStrong"
      >
        <Box w={8} h={8} shrink={0} radius="circle" bg="accent" />
        <Text variant="label">{notice.text}</Text>
        {notice.undo ? (
          <Button variant="ghost" size="sm" label={t('monitoring.undo')} onPress={notice.undo} />
        ) : null}
      </Row>
    </div>
  );
}

const s = styles({
  bar: {
    position: 'fixed',
    bottom: 24,
    left: '50%',
    zIndex: 80,
    transition:
      'opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out), bottom var(--dur-base) var(--ease-out)',
  },
  lifted: { bottom: 88 },
  shown: { opacity: 1, transform: [{ translateX: '-50%' }, { translateY: 0 }] },
  hidden: {
    opacity: 0,
    pointerEvents: 'none',
    transform: [{ translateX: '-50%' }, { translateY: 12 }],
  },
});
