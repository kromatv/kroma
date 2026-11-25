import { apiErrorText } from '@kromatv/client';
import { useT } from '@kromatv/ui';
import { Box, Callout, Dialog, Spinner, Text } from '@kromatv/ui/kit';
import { createCallable } from 'react-call';
import { TitleDialogHeading } from '#web/features/catalog/title-dialog-heading.component';
import type { ReadyInfo } from '#web/features/catalog/title-info-fields.component';
import {
  EpisodeSections,
  TitleSections,
} from '#web/features/catalog/title-info-sections.component';
import type { TitleShown } from '#web/features/catalog/title-shown';
import { type InfoSubject, useTitleInfo } from '#web/features/catalog/use-title-info.hook';

type Props = InfoSubject & Readonly<{ title: string }>;

function Failure({ text }: Readonly<{ text: string | null }>) {
  return text ? (
    <Callout.Root tone="danger">
      <Callout.Title>{text}</Callout.Title>
    </Callout.Root>
  ) : null;
}

function InfoBody({ info, episode }: Readonly<{ info: ReadyInfo; episode: boolean }>) {
  const t = useT();
  return (
    <Box gap={28}>
      <Text variant="meta" color="white/55">
        {t('titleInfo.hint')}
      </Text>
      {episode ? <EpisodeSections info={info} /> : <TitleSections info={info} />}
      <Failure text={info.failure} />
    </Box>
  );
}

function Loading({ error }: Readonly<{ error: unknown }>) {
  const t = useT();
  return error ? <Failure text={apiErrorText(error, t('titleInfo.loadFailed'))} /> : <Spinner />;
}

function useReadyInfo(props: Props, onDone: () => void) {
  const info = useTitleInfo(props, onDone);
  const { draft, loaded } = info;
  const shown: TitleShown | undefined = props.shown;
  const ready: ReadyInfo | null = draft && loaded ? { ...info, draft, loaded, shown } : null;
  return { info, ready };
}

/** The name, original title, sort title, release date, age rating, tagline,
 * summary, genres, studios, directors and cast a person who manages the
 * library writes by hand for a film or a show, and the name, air date and
 * summary for an episode (`kind: 'episode'`). Each field shows what the page
 * shows until it changes, and a reset hands it back to the `.nfo` file or the
 * provider. Open with `await TitleInfoDialog.call({ kind, id, title, shown })`;
 * it resolves on dismiss and once the edit is saved. */
export const TitleInfoDialog = createCallable<Props>((props) => {
  const t = useT();
  const close = () => props.call.end();
  const { info, ready } = useReadyInfo(props, close);
  return (
    <Dialog.Root open title={props.title} width="lg" onClose={close}>
      <Dialog.Header>
        <TitleDialogHeading overline={t('titleInfo.title')} title={props.title} onClose={close} />
      </Dialog.Header>
      <Dialog.Panel>
        {ready ? (
          <InfoBody info={ready} episode={props.kind === 'episode'} />
        ) : (
          <Loading error={info.error} />
        )}
      </Dialog.Panel>
      {ready ? (
        <Dialog.Footer>
          <Dialog.Actions
            onCancel={close}
            cancelLabel={t('common.cancel')}
            onConfirm={() => info.submit(ready.draft)}
            confirmLabel={t('common.save')}
            busy={info.busy}
          />
        </Dialog.Footer>
      ) : null}
    </Dialog.Root>
  );
});
