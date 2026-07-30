import type { ReportCategory } from '@kroma/core';
import { forwardRef, useImperativeHandle, useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { useListFocus } from '#ui/components/organisms/player/hooks/useListFocus';
import type { PanelHandle } from '#ui/components/organisms/player/lib/nav';
import { REPORT_CATEGORIES } from '#ui/lib/report-categories';
import { useT } from '#ui/services/i18n';
import { panelList } from './panelStyle';
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

  const pick = (i: number) => {
    const category = REPORT_CATEGORIES[i]?.key;
    if (!category || state === 'busy' || state === 'done') return;
    setState('busy');
    onReport(category)
      .then(() => setState('done'))
      .catch(() => setState('failed'));
  };
  const focus = useListFocus({ count: REPORT_CATEGORIES.length, onActivate: pick, onBack });
  useImperativeHandle(ref, () => ({ onKey: focus.onKey }), [focus.onKey]);

  // The panel becomes its own receipt rather than closing itself: closing
  // playback chrome from under the viewer loses their place in the film.
  if (state === 'done') {
    return (
      <Box style={panelList}>
        <Txt style={{ fontSize: 22, fontWeight: '600' }}>{t('report.submitted')}</Txt>
      </Box>
    );
  }

  return (
    <Box style={panelList}>
      {REPORT_CATEGORIES.map((c, i) => (
        <SelectRow
          key={c.key}
          label={t(c.labelKey)}
          sub={t(c.hintKey)}
          focused={focus.index === i}
          onActivate={() => pick(i)}
          onFocus={focus.hover(i)}
        />
      ))}
      {state === 'failed' ? (
        <Txt style={{ fontSize: 17, fontWeight: '600' }} color="danger">
          {t('report.failed')}
        </Txt>
      ) : null}
    </Box>
  );
});
