// WHICH sub-panel a view opens.
//
// One switch, so the panel's own render stays the shell it is: the eight
// `view === 'x' ? <XPanel …/> : null` lines it replaces read as eight
// independent decisions when they are one.
//
// Every panel takes the same ref - the open one owns the keys (PanelHandle) -
// and the same `onBack`, which returns to the menu.

import type { ReportCategory } from '@kroma/core';
import { forwardRef } from 'react';
import type { PanelHandle } from '../../lib/nav';
import type { SubtitleAppearance } from '../../lib/subtitle-appearance';
import type { PlayerController } from '../../types';
import { AudioFilterPanel } from './AudioFilterPanel';
import { AudioPanel } from './AudioPanel';
import type { View } from './entries';
import type { SubtitleGenBundle } from './gen';
import { QualityPanel } from './QualityPanel';
import { ReportPanel } from './ReportPanel';
import { SpeedPanel } from './SpeedPanel';
import { SubtitleAppearancePanel } from './SubtitleAppearancePanel';
import { SubtitlesPanel } from './SubtitlesPanel';

export interface SubViewProps {
  view: View;
  controller: PlayerController;
  appearance: SubtitleAppearance;
  onAppearance: (p: Partial<SubtitleAppearance>) => void;
  subtitleGen: SubtitleGenBundle;
  onReport?: (category: ReportCategory) => Promise<void>;
  onBack: () => void;
}

export const SubView = forwardRef<PanelHandle, SubViewProps>(function SubView(
  { view, controller: c, appearance, onAppearance, subtitleGen, onReport, onBack },
  ref,
) {
  switch (view) {
    case 'quality':
      return (
        <QualityPanel
          ref={ref}
          qualities={c.qualities}
          current={c.qualityId}
          onSelect={(id) => c.setQuality(id)}
          onBack={onBack}
        />
      );
    // The engine picker is a quality picker: both pick one id from a labelled list.
    case 'engine':
      return c.engines ? (
        <QualityPanel
          ref={ref}
          qualities={c.engines}
          current={c.engineId ?? ''}
          onSelect={(id) => c.setEngine?.(id)}
          onBack={onBack}
        />
      ) : null;
    case 'audio':
      return (
        <AudioPanel
          ref={ref}
          tracks={c.audioTracks}
          current={c.audioIndex}
          onSelect={(i) => c.setAudio(i)}
          onBack={onBack}
        />
      );
    case 'audioFilter':
      return (
        <AudioFilterPanel
          ref={ref}
          value={c.audioFilter}
          onSelect={(m) => c.setAudioFilter(m)}
          onBack={onBack}
        />
      );
    case 'subtitles':
      return (
        <SubtitlesPanel
          ref={ref}
          subs={c.subtitles}
          current={c.subtitleIndex}
          onSelect={(i) => c.setSubtitle(i)}
          gen={subtitleGen}
          onBack={onBack}
        />
      );
    case 'appearance':
      return (
        <SubtitleAppearancePanel
          ref={ref}
          appearance={appearance}
          onAppearance={onAppearance}
          onBack={onBack}
        />
      );
    case 'report':
      return onReport ? <ReportPanel ref={ref} onReport={onReport} onBack={onBack} /> : null;
    case 'speed':
      return <SpeedPanel ref={ref} rate={c.rate} onSelect={(r) => c.setRate(r)} onBack={onBack} />;
    default:
      return null;
  }
});
