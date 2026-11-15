import { useT } from '@kromatv/module-sdk';
import { IconButton, Tooltip } from '@kromatv/ui/kit';

/** Opens the release's own page on the indexer that listed it, in a new tab. */
export function IndexerLink({
  href,
  indexer,
  title,
}: Readonly<{ href: string; indexer: string; title: string }>) {
  const t = useT();
  const label = t('acq.openOnIndexer', { indexer });
  return (
    <Tooltip label={label}>
      <IconButton
        control="sm"
        variant="glass"
        icon="external-link"
        label={`${label} : ${title}`}
        onPress={() => globalThis.open?.(href, '_blank', 'noopener,noreferrer')}
      />
    </Tooltip>
  );
}
