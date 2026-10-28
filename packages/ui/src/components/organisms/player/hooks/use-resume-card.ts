import { useState } from 'react';
import type { RemoteKey } from '#ui/lib/remote-keys';
import type { ResumeFocus } from '../parts/resume-prompt';
import type { ResumeNotice } from './use-resume-notice';

export interface ResumeCard {
  focus: ResumeFocus;
  resume: () => void;
  onKey: (key: RemoteKey) => boolean;
}

/** The resume card's own focus: it takes the remote the moment it is shown,
 * on the button that keeps watching, so a reflex OK never restarts the film. */
export function useResumeCard(notice: ResumeNotice, onStartOver: () => void): ResumeCard {
  const [focus, setFocus] = useState<ResumeFocus>('resume');
  const [shown, setShown] = useState(notice.shown);
  if (shown !== notice.shown) {
    setShown(notice.shown);
    if (notice.shown) setFocus('resume');
  }

  const resume = notice.dismiss;
  const onKey = (key: RemoteKey): boolean => {
    if (!notice.shown) return false;
    switch (key) {
      case 'Left':
      case 'Right':
        notice.holdOpen();
        setFocus((f) => (f === 'resume' ? 'restart' : 'resume'));
        return true;
      case 'Enter':
        if (focus === 'resume') resume();
        else onStartOver();
        return true;
      case 'Back':
        resume();
        return true;
      default:
        return false;
    }
  };
  return { focus, resume, onKey };
}
