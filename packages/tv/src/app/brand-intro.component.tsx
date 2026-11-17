import { KromaIntro, sessionFlag } from '@kromatv/ui/kit';
import { NativeFilm } from '@kromatv/ui/native-film';
import { useState } from 'react';

const introSeen = sessionFlag('kroma:intro-seen');

export function BrandIntro() {
  const [done, setDone] = useState(() => introSeen.isSet());
  if (done) {
    return null;
  }
  const finish = () => {
    introSeen.set();
    setDone(true);
  };
  return (
    <>
      <KromaIntro onDone={finish} />
      <NativeFilm onDone={finish} />
    </>
  );
}
