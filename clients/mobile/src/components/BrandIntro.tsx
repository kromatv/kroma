import { ThemeProvider } from '@kromatv/ui/kit';
import { NativeFilm } from '@kromatv/ui/native-film';
import { useState } from 'react';
import { MOBILE } from '#mobile/lib/theme';

const PORTRAIT_FILM: number = require('../../assets/kroma-intro-hevc-portrait.mp4');

/** The brand film over the app, once per launch and once `ready`: the portrait
 * cut on an upright phone, the landscape master on a tablet held sideways. */
export function BrandIntro({ ready }: Readonly<{ ready: boolean }>) {
  const [done, setDone] = useState(false);
  if (done || !ready) return null;
  return (
    <ThemeProvider theme={MOBILE}>
      <NativeFilm portraitSrc={PORTRAIT_FILM} onDone={() => setDone(true)} />
    </ThemeProvider>
  );
}
