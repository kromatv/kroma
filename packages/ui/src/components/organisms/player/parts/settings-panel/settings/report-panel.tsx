import type { ReportCategory } from '@kroma/core';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { useListFocus } from '#ui/components/organisms/player/hooks/use-list-focus';
import type { PanelHandle } from '#ui/components/organisms/player/lib/nav';
import { REPORT_CATEGORIES } from '#ui/lib/report-categories';
import { useT } from '#ui/services/i18n';
import { panel } from './panel-style';
import { SelectRow } from './select-row';

// A category and nothing else: no free-text field mid-film. Details belong to
// the detail page's report screen.
interface ReportPanelProps {
  onReport: (category: ReportCategory) => Promise<void>;
  onBack: () => void;
}

export const ReportPanel = forwardRef<PanelHandle, ReportPanelProps>(function ReportPanel(
  { onReport, onBack },
  ref,
) {
  const t = useT();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');

  // In-flight is a ref, not `state`: a press reads it at press time, whereas
  // `state` is whatever the last committed render closed over. After a failure
  // that difference drops the viewer's retry if they press before React has
  // re-rendered.
  const sending = useRef(false);
  const pick = (i: number) => {
    const category = REPORT_CATEGORIES[i]?.key;
    if (!category || sending.current || state === 'done') return;
    sending.current = true;
    setState('busy');
    onReport(category)
      .then(() => setState('done'))
      .catch(() => setState('failed'))
      .finally(() => {
        sending.current = false;
      });
  };
  const focus = useListFocus({ count: REPORT_CATEGORIES.length, onActivate: pick, onBack });
  useImperativeHandle(ref, () => ({ onKey: focus.onKey }), [focus.onKey]);

  // The panel becomes its own receipt rather than closing itself: closing
  // playback chrome from under the viewer loses their place in the film.
  if (state === 'done') {
    return (
      <Box style={panel.panelList}>
        <Text variant="subheadingTv">{t('report.submitted')}</Text>
      </Box>
    );
  }

  return (
    <Box style={panel.panelList}>
      {REPORT_CATEGORIES.map((c, i) => (
        <SelectRow
          key={c.key}
          index={i}
          label={t(c.labelKey)}
          sub={t(c.hintKey)}
          focused={focus.index === i}
          onActivate={pick}
          onFocus={focus.setIndex}
        />
      ))}
      {state === 'failed' ? (
        <Text variant="labelTv" color="danger">
          {t('report.failed')}
        </Text>
      ) : null}
    </Box>
  );
});
