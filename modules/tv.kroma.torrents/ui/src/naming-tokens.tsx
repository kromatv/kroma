// Radarr-style "Jetons de nom de fichier" token picker: a per-field modal that
// lists the naming tokens grouped by category with a live example each, plus
// full-filename presets and a separator helper. Clicking a token inserts it at
// the cursor of the field being edited; clicking a preset replaces the field.

import { useT } from '@kroma/module-sdk';
import {
  Box,
  Button,
  Dialog,
  Focusable,
  Grid,
  IconButton,
  Row,
  Section,
  Select,
  sv,
  Text,
  useBreakpoint,
} from '@kroma/ui/kit';
import { type CSSProperties, useRef, useState } from 'react';
import { createCallable } from 'react-call';
import type { NamingTemplatesView } from './schemas';

type FieldKey = keyof Omit<NamingTemplatesView, 'case'>;

type Token = Readonly<{ token: string; example: string }>;
type Group = Readonly<{ titleKey: string; tokens: readonly Token[] }>;

// The working value needs cursor-position inserts, so it stays a hand-rolled
// DOM input wearing the field box locally.
const FIELD: CSSProperties = {
  flex: 1,
  minWidth: 0,
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--kroma-border-strong)',
  background: 'var(--kroma-surface-2)',
  padding: '9px 14px',
  font: 'var(--type-meta)',
  fontFamily: 'var(--font-mono)',
  color: 'var(--kroma-text)',
  transition: 'border-color var(--dur-fast) var(--ease-out)',
};

const tokenTile = sv({
  base: {
    w: '100%',
    radius: 'sm',
    border: 'tint/10',
    bg: 'tint/3',
    px: 10,
    py: 6,
    _hover: { border: 'accent/50', bg: 'tint/6' },
  },
  variants: {
    kind: { preset: { px: 12, py: 8 }, token: {} },
  },
  defaults: { kind: 'token' },
});

const QUALITY: Group = {
  titleKey: 'naming.grpQuality',
  tokens: [
    { token: '{Quality Full}', example: 'Bluray-1080p Proper' },
    { token: '{Quality Title}', example: 'Bluray-1080p' },
  ],
};

const MEDIAINFO: Group = {
  titleKey: 'naming.grpMediaInfo',
  tokens: [
    { token: '{MediaInfo VideoCodec}', example: 'x265' },
    { token: '{MediaInfo VideoBitDepth}', example: '10' },
    { token: '{MediaInfo VideoDynamicRange}', example: 'HDR' },
    { token: '{MediaInfo AudioCodec}', example: 'DTS' },
    { token: '{MediaInfo AudioChannels}', example: '5.1' },
    { token: '{MediaInfo AudioLanguages}', example: '[EN+FR]' },
    { token: '{MediaInfo SubtitleLanguages}', example: '[FR]' },
  ],
};

const RELEASE_GROUP: Group = {
  titleKey: 'naming.grpReleaseGroup',
  tokens: [{ token: '{Release Group}', example: 'RlsGrp' }],
};

const EDITION: Group = {
  titleKey: 'naming.grpEdition',
  tokens: [{ token: '{Edition Tags}', example: 'IMAX' }],
};

const MOVIE_GROUPS: readonly Group[] = [
  {
    titleKey: 'naming.grpMovie',
    tokens: [
      { token: '{Movie Title}', example: "Movie's Title" },
      { token: '{Movie CleanTitle}', example: 'Movies Title' },
      { token: '{Movie TitleThe}', example: "Movie's Title, The" },
      { token: '{Movie TitleFirstCharacter}', example: 'M' },
      { token: '{Release Year}', example: '2010' },
    ],
  },
  {
    titleKey: 'naming.grpMovieId',
    tokens: [
      { token: '{ImdbId}', example: 'tt12345' },
      { token: '{TmdbId}', example: '123456' },
    ],
  },
  QUALITY,
  MEDIAINFO,
  RELEASE_GROUP,
  EDITION,
];

const SERIES_GROUPS: readonly Group[] = [
  {
    titleKey: 'naming.grpSeries',
    tokens: [
      { token: '{Series Title}', example: 'Series Title' },
      { token: '{Series CleanTitle}', example: 'Series Title' },
      { token: '{Series TitleThe}', example: 'Series Title, The' },
      { token: '{Series TitleFirstCharacter}', example: 'S' },
      { token: '{Release Year}', example: '2008' },
    ],
  },
  {
    titleKey: 'naming.grpEpisode',
    tokens: [
      { token: '{season:00}', example: '01' },
      { token: '{episode:00}', example: '05' },
      { token: '{Episode Title}', example: 'Episode Title' },
    ],
  },
  QUALITY,
  MEDIAINFO,
  RELEASE_GROUP,
];

// Full-filename presets, as token lists joined by the chosen separator.
const MOVIE_PRESETS: readonly (readonly string[])[] = [
  ['{Movie Title}', '({Release Year})', '{Quality Full}'],
  [
    '{Movie CleanTitle}',
    '({Release Year})',
    '[{MediaInfo VideoDynamicRange}]',
    '{Quality Full}{-Release Group}',
  ],
];
const EPISODE_PRESETS: readonly (readonly string[])[] = [
  ['{Series Title}', '-', 'S{season:00}E{episode:00}', '-', '{Episode Title}', '{Quality Full}'],
];

const SEPARATORS: readonly { value: string; labelKey: string }[] = [
  { value: ' ', labelKey: 'naming.sepSpace' },
  { value: '.', labelKey: 'naming.sepPeriod' },
  { value: '_', labelKey: 'naming.sepUnderscore' },
  { value: '-', labelKey: 'naming.sepDash' },
];

const isEpisode = (f: FieldKey) =>
  f === 'seriesFolder' || f === 'seasonFolder' || f === 'episodeFile';

export const NamingTokenModal = createCallable<
  Readonly<{
    fieldKey: FieldKey;
    fieldLabel: string;
    value: string;
    onChange: (v: string) => void;
  }>,
  void
>(({ call, fieldKey, fieldLabel, value: initialValue, onChange: onParentChange }) => {
  const t = useT();
  // Own the working value locally so multiple inserts compose correctly, and
  // mirror every edit back to the parent template so the page stays live-synced.
  const [value, setValue] = useState(initialValue);
  const [separator, setSeparator] = useState(' ');
  const inputRef = useRef<HTMLInputElement>(null);
  const columns = useBreakpoint() === 'base' ? 2 : 3;

  const onChange = (next: string) => {
    setValue(next);
    onParentChange(next);
  };

  const groups = isEpisode(fieldKey) ? SERIES_GROUPS : MOVIE_GROUPS;
  const presets = isEpisode(fieldKey) ? EPISODE_PRESETS : MOVIE_PRESETS;

  const insert = (token: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + token.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  return (
    <Dialog.Root
      open
      title={t('naming.tokensTitle')}
      width="xl"
      pad={24}
      onClose={() => call.end()}
    >
      <Dialog.Header>
        <Row between gap={12}>
          <Row gap={6} minW={0}>
            <Text variant="title">{t('naming.tokensTitle')}</Text>
            <Text variant="title" color="textDim" lines={1}>
              · {fieldLabel}
            </Text>
          </Row>
          <IconButton
            variant="ghost"
            icon="x"
            label={t('common.close')}
            onPress={() => call.end()}
          />
        </Row>
      </Dialog.Header>

      <Dialog.Panel>
        <Row gap={8}>
          <Text variant="meta" color="textDim">
            {t('naming.separator')}
          </Text>
          <Select.Root label={t('naming.separator')} value={separator} onValueChange={setSeparator}>
            <Select.Trigger />
            {SEPARATORS.map((sep) => (
              <Select.Item key={sep.value} value={sep.value}>
                {t(sep.labelKey as Parameters<typeof t>[0])}
              </Select.Item>
            ))}
          </Select.Root>
        </Row>

        <Section.Root gap={6}>
          <Section.Header>
            <Section.Title>{t('naming.grpPresets')}</Section.Title>
          </Section.Header>
          {presets.map((parts) => {
            const tokenStr = parts.join(separator);
            return (
              <Focusable
                key={tokenStr}
                sv={tokenTile}
                vars={{ kind: 'preset' }}
                label={tokenStr}
                onPress={() => onChange(tokenStr)}
              >
                <Text variant="meta" font="mono" color="info">
                  {tokenStr}
                </Text>
              </Focusable>
            );
          })}
        </Section.Root>

        {groups.map((g) => (
          <Section.Root key={g.titleKey} gap={6}>
            <Section.Header>
              <Section.Title>{t(g.titleKey as Parameters<typeof t>[0])}</Section.Title>
            </Section.Header>
            <Grid columns={columns} gap={6}>
              {g.tokens.map((tok) => (
                <Focusable
                  key={tok.token}
                  sv={tokenTile}
                  label={tok.token}
                  onPress={() => insert(tok.token)}
                >
                  <Text variant="meta" font="mono" color="text/80" lines={1}>
                    {tok.token}
                  </Text>
                  <Text variant="meta" color="textDim" lines={1}>
                    {example(tok.example, separator)}
                  </Text>
                </Focusable>
              ))}
            </Grid>
          </Section.Root>
        ))}
      </Dialog.Panel>

      <Dialog.Footer>
        <Row gap={12}>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={fieldLabel}
            style={FIELD}
          />
          <Box shrink={0}>
            <Button
              variant="glass"
              size="sm"
              label={t('common.close')}
              onPress={() => call.end()}
            />
          </Box>
        </Row>
      </Dialog.Footer>
    </Dialog.Root>
  );
});

function example(ex: string, separator: string): string {
  return separator === ' ' ? ex : ex.replaceAll(' ', separator);
}
