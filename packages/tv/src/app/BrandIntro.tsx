import { KromaIntro, sessionFlag } from '@kromatv/ui/kit';
import { NativeFilm } from '@kromatv/ui/native-film';
import { useState } from 'react';

export interface BrandIntroProps {
  videoSrc?: string;
}

const introSeen = sessionFlag('kroma:intro-seen');

export function BrandIntro({ videoSrc }: Readonly<BrandIntroProps>) {
  const [done, setDone] = useState(introSeen.isSet);
  if (done) return null;
  const finish = () => {
    introSeen.set();
    setDone(true);
  };
  return (
    <>
      <KromaIntro lite videoSrc={videoSrc} onDone={finish} />
      <NativeFilm videoSrc={videoSrc} onDone={finish} />
    </>
  );
}
