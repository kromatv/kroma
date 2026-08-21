import { release } from 'virtual:kroma-releases';
import { IconGitBranch, IconTag } from '@tabler/icons-react';
import type { IconComponent } from '#site/components/download/icon';
import { m } from '#site/paraglide/messages';

export const IMAGE = 'ghcr.io/maxscharwath/kroma';

export function ImageChannels() {
  return (
    <div className="mt-5 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
      <Channel
        icon={IconTag}
        tag={release ? release.version : 'X.Y.Z'}
        title={m.download_image_pinned_title()}
        body={m.download_image_pinned_body()}
      />
      <Channel
        icon={IconGitBranch}
        tag="latest"
        title={m.download_image_canary_title()}
        body={m.download_image_canary_body()}
      />
    </div>
  );
}

function Channel({
  icon: Icon,
  tag,
  title,
  body,
}: Readonly<{ icon: IconComponent; tag: string; title: string; body: string }>) {
  return (
    <div className="bg-surface-1/40 p-5">
      <div className="flex items-center gap-2">
        <Icon size={16} stroke={1.75} className="shrink-0 text-accent-text" aria-hidden />
        <p className="font-display text-sm font-bold text-text">{title}</p>
      </div>
      <code className="mt-3 block break-all font-mono text-xs text-accent-text">
        {IMAGE}:{tag}
      </code>
      <p className="mt-2.5 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
