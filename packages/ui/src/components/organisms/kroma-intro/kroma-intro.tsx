import { DomOnly } from '#ui/lib/dom-only';
import { KromaFilm, type KromaIntroProps } from './kroma-film';

export type { KromaIntroProps };

/** The brand film over the whole viewport; native shells play it through their own player, so it renders nothing there. */
export function KromaIntro(props: Readonly<KromaIntroProps>) {
  return (
    <DomOnly>
      <KromaFilm {...props} />
    </DomOnly>
  );
}
