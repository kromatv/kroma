import { L } from '#site/components/localized-link';
import { WheelMark } from '#site/components/wheel-mark';
import { m } from '#site/paraglide/messages';

export interface LogoProps {
  className?: string;
  /** Wheel size in px; the wordmark scales to sit beside it. */
  size?: number;
}

/** The KROMA lockup: the chromatic wheel, then the wordmark in the display face.
 *  A link to the localized home, so it works as the header brand in both
 *  languages. */
export function Logo({ className, size = 30 }: Readonly<LogoProps>) {
  return (
    <L
      to="/"
      aria-label={m.header_home()}
      className={['group inline-flex items-center gap-2.5', className].filter(Boolean).join(' ')}
    >
      <WheelMark
        size={size}
        className="transition-transform duration-500 group-hover:rotate-[30deg]"
      />
      <span
        className="font-display text-[1.35rem] font-extrabold leading-none tracking-tight text-text"
        style={{ letterSpacing: '0.01em' }}
      >
        KROMA
      </span>
    </L>
  );
}
