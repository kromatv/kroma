// "Nouvelle demande" from the admin queue: find a title on TMDB and open it as
// a request. The queue could only ever filter the requests that already existed,
// so getting a film in meant leaving for the user-facing discovery page.
//
// A search palette rather than a form: the field IS the interface. Typing
// searches, so there is no button to press and no moment where the list and the
// field disagree about what was asked. The rows are compact and say what KROMA
// already knows about each title, because choosing between four films called
// "Odysseus" is the whole job here.
//
// Asking does NOT close the dialog: an admin filling a queue asks for six things
// in a row, and a dialog that shut and navigated after each one would make that
// six round trips through the queue page. The row it just asked for flips to
// "already requested" in place, and leaving is the footer's job.

import { apiErrorText, type DiscoverEntry } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  Button,
  Callout,
  Chip,
  Dialog,
  EmptyState,
  Field,
  Icon,
  ListRow,
  Row,
  SegmentGroup,
  Skeleton,
  Spinner,
  Text,
} from '@kroma/ui/kit';
import { useEffect, useState } from 'react';
import { posterGrad } from '#web/features/admin/pipeline-meta';
import { useAuth } from '#web/shared/lib/auth';
import { Image } from '#web/shared/ui';

type Scope = 'all' | 'movie' | 'tv';

// Long enough that a typed word is one request, short enough to feel live.
const DEBOUNCE_MS = 350;
// One letter matches half of TMDB; asking for it is a wasted round trip.
const MIN_CHARS = 2;

export function NewRequestDialog({
  open,
  onClose,
  onOpenRequest,
  onCreated,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  /** Leave for a request's own page. Closes the dialog: it is a departure. */
  onOpenRequest: (requestId: string) => void;
  /** A request was just made and the dialog stayed open, so whatever is behind
   *  it is now out of date. */
  onCreated: () => void;
}>) {
  const t = useT();
  const { client } = useAuth();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<DiscoverEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  // What THIS session asked for, by TMDB id: the results came from the server
  // before any of it existed, so the rows learn about it from here.
  const [created, setCreated] = useState<Record<number, string>>({});
  const [made, setMade] = useState<string | null>(null);

  const needle = query.trim();
  const short = needle.length < MIN_CHARS;

  // Debounced, and every answer checked against the input that asked for it:
  // typing fast must not let an early, shorter query land last.
  useEffect(() => {
    if (short) {
      setResults(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    let live = true;
    const at = setTimeout(() => {
      client
        .discoverSearch(needle, { type: scope })
        .then((r) => {
          if (!live) return;
          setResults(r.results);
          setError(null);
        })
        .catch((e) => {
          if (live) setError(apiErrorText(e, t('requests.searchFailed')));
        })
        .finally(() => {
          if (live) setBusy(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(at);
    };
  }, [client, t, needle, scope, short]);

  // An entry the queue already covers opens rather than duplicating: asking for
  // the same title twice is a merge server-side, and a second row here would be
  // a lie about what happened.
  const requestIdOf = (entry: DiscoverEntry) => entry.requestId ?? created[entry.tmdbId] ?? null;

  const ask = (entry: DiscoverEntry) => {
    const existing = requestIdOf(entry);
    if (existing) {
      onOpenRequest(existing);
      return;
    }
    setAdding(entry.tmdbId);
    setError(null);
    client
      .createRequest({ kind: entry.kind, tmdbId: entry.tmdbId, seasons: null })
      .then((req) => {
        setCreated((c) => ({ ...c, [entry.tmdbId]: req.id }));
        setMade(entry.title);
        onCreated();
      })
      .catch((e) => setError(apiErrorText(e, t('requests.actionFailed'))))
      .finally(() => setAdding(null));
  };

  return (
    <Dialog.Root open={open} onClose={onClose} width="lg" title={t('requests.newRequest')}>
      <Dialog.Header>
        <Text variant="title" accessibilityRole="header">
          {t('requests.newRequest')}
        </Text>
        <Row wrap gap={10} align="center" mt={10}>
          <Box flex minW={200}>
            <Field.Root
              label={t('requests.newRequestLabel')}
              hideLabel
              value={query}
              onValueChange={setQuery}
            >
              <Field.Input icon="search" placeholder={t('requests.newRequestPlaceholder')} />
            </Field.Root>
          </Box>
          <Box shrink={0}>
            <SegmentGroup.Root
              value={scope}
              onValueChange={setScope}
              label={t('requests.newRequestScope')}
            >
              <SegmentGroup.Item value="all">
                <SegmentGroup.Label>{t('requests.ledgerAll')}</SegmentGroup.Label>
              </SegmentGroup.Item>
              <SegmentGroup.Item value="movie">
                <SegmentGroup.Label>{t('requests.targetMovie')}</SegmentGroup.Label>
              </SegmentGroup.Item>
              <SegmentGroup.Item value="tv">
                <SegmentGroup.Label>{t('requests.scopeShows')}</SegmentGroup.Label>
              </SegmentGroup.Item>
            </SegmentGroup.Root>
          </Box>
          <Box w={16} shrink={0}>
            {busy ? <Spinner size={16} /> : null}
          </Box>
        </Row>
      </Dialog.Header>

      <Dialog.Panel>
        <Box gap={12}>
          {error ? (
            <Callout.Root tone="danger">
              <Callout.Title>{error}</Callout.Title>
            </Callout.Root>
          ) : null}
          {made ? (
            <Callout.Root tone="success">
              <Callout.Title>{t('requests.newRequestMade', { title: made })}</Callout.Title>
            </Callout.Root>
          ) : null}

          {short ? (
            <EmptyState.Root icon="search">
              <EmptyState.Title>{t('requests.newRequestIdle')}</EmptyState.Title>
              <EmptyState.Hint>{t('requests.newRequestHint')}</EmptyState.Hint>
            </EmptyState.Root>
          ) : null}

          {!short && busy && results == null ? (
            <Box gap={8}>
              {[0, 1, 2, 3].map((n) => (
                <Skeleton key={n} w="100%" h={92} radius="lg" />
              ))}
            </Box>
          ) : null}

          {!short && results?.length === 0 ? (
            <EmptyState.Root icon="search">
              <EmptyState.Title>{t('requests.newRequestNothing')}</EmptyState.Title>
            </EmptyState.Root>
          ) : null}

          {!short && results != null && results.length > 0 ? (
            <ListRow.Group>
              {results.map((entry) => (
                <ResultRow
                  key={`${entry.kind}-${entry.tmdbId}`}
                  entry={entry}
                  requestId={requestIdOf(entry)}
                  busy={adding === entry.tmdbId}
                  onPick={() => ask(entry)}
                />
              ))}
            </ListRow.Group>
          ) : null}
        </Box>
      </Dialog.Panel>

      <Dialog.Footer>
        <Dialog.Actions>
          <Button variant="ghost" label={t('common.close')} onPress={onClose} />
        </Dialog.Actions>
      </Dialog.Footer>
    </Dialog.Root>
  );
}

function ResultRow({
  entry,
  requestId,
  busy,
  onPick,
}: Readonly<{
  entry: DiscoverEntry;
  /** The request covering this title, from the server or from this session. */
  requestId: string | null;
  busy: boolean;
  onPick: () => void;
}>) {
  const t = useT();
  const kind = t(entry.kind === 'show' ? 'pipeline.type.show' : 'pipeline.type.movie');
  const facts = [entry.year ? String(entry.year) : null, kind].filter(Boolean).join(' · ');
  const status = statusOf(entry, requestId);
  return (
    <ListRow.Root chevron={false} label={entry.title}>
      <ListRow.Leading>
        <Box w={52} h={76} shrink={0} radius="sm" overflow="hidden">
          <div style={{ position: 'absolute', inset: 0, background: posterGrad(entry.title) }} />
          <Image src={entry.posterUrl} fit="cover" fill />
        </Box>
      </ListRow.Leading>
      <ListRow.Label>{entry.title}</ListRow.Label>
      <Row gap={8} align="center" wrap>
        {entry.rating ? <Stars rating={entry.rating} /> : null}
        <Text variant="meta" color="textDim">
          {facts}
        </Text>
      </Row>
      {entry.overview ? <ListRow.Hint>{entry.overview}</ListRow.Hint> : null}
      <ListRow.Trailing shrink>
        <Row gap={8} align="center" shrink={0}>
          {status ? <Chip size="sm" dot={status.dot} label={t(status.label)} /> : null}
          <Button
            size="sm"
            variant={status ? 'ghost' : 'primary'}
            icon={status ? 'external-link' : 'plus'}
            label={t(status ? 'requests.newRequestOpen' : 'requests.newRequestAsk')}
            onPress={onPick}
            loading={busy}
          />
        </Row>
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

// TMDB rates out of ten; five stars is the shape people read one at a glance.
// Half a star at a time, because the difference between a 6.8 and a 7.4 is the
// whole reason to show it.
function Stars({ rating }: Readonly<{ rating: number }>) {
  const outOfFive = rating / 2;
  return (
    <Row gap={1} align="center" shrink={0}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Icon key={i} name={starGlyph(outOfFive - i)} size={11} color={starInk(outOfFive - i)} />
      ))}
      <Text variant="meta" color="textDim" ml={4}>
        {rating.toFixed(1)}
      </Text>
    </Row>
  );
}

function starGlyph(filled: number): 'star-filled' | 'star-half-filled' | 'star' {
  if (filled >= 0.75) return 'star-filled';
  return filled >= 0.25 ? 'star-half-filled' : 'star';
}

function starInk(filled: number): 'accent' | 'text/20' {
  return filled >= 0.25 ? 'accent' : 'text/20';
}

// What KROMA already knows about this title, which is what tells four films of
// the same name apart. Nothing for one it has never seen: there the row's own
// chevron is the whole story.
function statusOf(entry: DiscoverEntry, requestId: string | null) {
  if (requestId) {
    return { dot: 'accent', label: 'requests.newRequestExisting' } as const;
  }
  return entry.inLibrary ? ({ dot: 'success', label: 'requests.stateOnDisk' } as const) : null;
}
