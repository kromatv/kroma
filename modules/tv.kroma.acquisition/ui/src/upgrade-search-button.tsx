import type { RequestKind, SearchScope } from '@kromatv/client/requests';
import { useCap, useT } from '@kromatv/module-sdk';
import { Button, useBreakpoint } from '@kromatv/ui/kit';
import { useState } from 'react';
import type { JudgedFile } from './judgement-schemas';
import { SearchResultsDialog } from './search-results-dialog';
import { upgradeScope } from './upgrade-scope';
import { useTitleSearch } from './use-title-search';

export function UpgradeSearchButton({
  kind,
  tmdbId,
  title,
  files,
}: Readonly<{
  kind: RequestKind;
  tmdbId: number;
  title: string;
  files: readonly JudgedFile[];
}>) {
  const t = useT();
  const search = useTitleSearch(kind, tmdbId);
  const [opened, setOpened] = useState(false);
  const library = useCap('library.manage');
  const requests = useCap('requests.manage');
  const settings = useCap('settings.manage');
  const narrow = useBreakpoint() === 'base';
  const scope = upgradeScope(kind, files);

  return (
    <>
      <Button
        size="sm"
        variant="primary"
        icon="search"
        block={narrow}
        label={t('acq.improveNow')}
        loading={search.state.busy}
        onPress={() => {
          setOpened(true);
          search.run(scope);
        }}
      />
      {opened ? (
        <SearchResultsDialog
          subject={subjectOf(title, scope)}
          state={search.state}
          canGrab={library || requests || settings}
          onGrab={search.grab}
          onClose={() => {
            search.reset();
            setOpened(false);
          }}
        />
      ) : null}
    </>
  );
}

function subjectOf(title: string, scope: SearchScope): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  switch (scope.scope) {
    case 'season':
      return `${title} S${pad(scope.season)}`;
    case 'episode':
      return `${title} S${pad(scope.season)}E${pad(scope.episode)}`;
    default:
      return title;
  }
}
