import { useCrossfade } from '#web/shared/lib/use-crossfade';
import { Image } from '#web/shared/ui';

/** The browse pages' display title, shared with the routes' pending headers so
 * the skeleton does not jump on settle. */
export const BROWSE_TITLE =
  'font-display text-[clamp(36px,4.5vw,56px)] font-bold leading-[.95] tracking-[-.03em]';

// No-artwork fallback: the two-tone amber/violet wash, eased in from the left
// so nothing hard-clips at the sidebar seam.
const GLOW =
  'pointer-events-none absolute inset-0 bg-[radial-gradient(46%_95%_at_12%_0%,rgba(242,180,66,.17),transparent_64%),radial-gradient(42%_85%_at_88%_0%,rgba(96,78,214,.15),transparent_64%)] [mask-image:linear-gradient(90deg,transparent,black_4rem)]';

// Near-opaque bg at the left and bottom edges: the left hides the sidebar
// seam, the bottom hands the artwork off to the toolbar and grid below.
const SCRIM =
  'pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,var(--kroma-bg)_4%,rgba(10,10,12,.45)_36%,transparent_66%),linear-gradient(0deg,var(--kroma-bg)_6%,rgba(10,10,12,.3)_38%,transparent_64%)]';

export interface BrowseHeroProps {
  heading: string;
  /** Small amber label over the title: the active genre, or the library. */
  eyebrow: string;
  countText?: string;
  /** Backdrop of the view's current featured title; without one the hero
   *  falls back to an ambient wash. */
  backdrop?: string | null;
  /** Which title the artwork belongs to, named in the corner. */
  creditTitle?: string;
}

/** The cinematic band opening a catalogue page: the current view's own
 * artwork bled edge to edge behind the page title, crossfading as the caller
 * rotates through its featured titles, so filtering visibly repaints the page
 * with what it found. */
export function BrowseHero({
  heading,
  eyebrow,
  countText,
  backdrop = null,
  creditTitle,
}: Readonly<BrowseHeroProps>) {
  const prev = useCrossfade(backdrop);
  return (
    <section className="relative -mx-(--gutter-web) -mt-9 flex min-h-[clamp(230px,26vw,340px)] flex-col justify-end overflow-hidden px-(--gutter-web) pb-5 pt-16">
      {backdrop ? (
        <>
          {prev ? <Image src={prev} fit="cover" position="center 22%" fill /> : null}
          <div key={backdrop} className="absolute inset-0 animate-[fade-in_.9s_var(--ease-out)]">
            <Image src={backdrop} fit="cover" position="center 22%" fill />
          </div>
          <div className={SCRIM} />
          <div className="pointer-events-none absolute inset-0 animate-[kroma-breathe_7s_var(--ease-out)_infinite] bg-[radial-gradient(58%_68%_at_76%_28%,rgba(242,180,66,.13),transparent_62%)]" />
        </>
      ) : (
        <div className={GLOW} />
      )}
      <div className="relative">
        <div className="mb-2.5 text-[12px] font-bold uppercase tracking-[.22em] text-accent">
          {eyebrow}
        </div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-3">
          <h1 className={BROWSE_TITLE}>{heading}</h1>
          {countText ? (
            <span className="rounded-full border border-white/10 bg-black/30 px-4 py-1.5 text-[14px] font-semibold tabular-nums text-muted backdrop-blur-sm">
              {countText}
            </span>
          ) : null}
        </div>
      </div>
      {backdrop && creditTitle ? (
        <span
          key={creditTitle}
          className="absolute bottom-3 right-(--gutter-web) animate-[fade-in_.9s_var(--ease-out)] text-[11px] font-medium text-white/35"
        >
          {creditTitle}
        </span>
      ) : null}
    </section>
  );
}
