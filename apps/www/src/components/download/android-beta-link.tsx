import { IconArrowRight } from '@tabler/icons-react';
import { L } from '#site/components/localized-link';
import { m } from '#site/paraglide/messages';

export function AndroidBetaLink() {
  return (
    <L
      to="/beta/android"
      className="group flex items-center justify-between gap-3 rounded-xl border border-border-strong px-5 py-3 text-sm font-semibold text-accent-text transition-colors hover:bg-wash"
    >
      {m.android_beta_action()}
      <IconArrowRight
        size={17}
        aria-hidden
        className="shrink-0 transition-transform group-hover:translate-x-0.5"
      />
    </L>
  );
}
