import { KROMA_KR_PATH, KROMA_LOCKUP, KROMA_MA_PATH } from '@kroma/ui/lockup';
import { WheelMark } from '#site/components/wheel-mark';
import { m } from '#site/paraglide/messages';

const KR = { path: KROMA_KR_PATH, x: 0, width: KROMA_LOCKUP.krWidth + KROMA_LOCKUP.gapLeft };
const MA = {
  path: KROMA_MA_PATH,
  x: KROMA_LOCKUP.maX - KROMA_LOCKUP.gapRight,
  width: KROMA_LOCKUP.maWidth + KROMA_LOCKUP.gapRight,
};

export interface LockupProps {
  className?: string;
}

export function Lockup({ className }: Readonly<LockupProps>) {
  const letters = ({ path, x, width }: typeof KR) => (
    <svg
      viewBox={`${x} 0 ${width} ${KROMA_LOCKUP.height}`}
      fill="currentColor"
      className="h-full w-auto"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );

  return (
    <span
      role="img"
      aria-label={m.home_hero_logo_alt()}
      className={['inline-flex items-center text-text', className].filter(Boolean).join(' ')}
    >
      {letters(KR)}
      <WheelMark size={KROMA_LOCKUP.height} className="h-full w-auto" />
      {letters(MA)}
    </span>
  );
}
