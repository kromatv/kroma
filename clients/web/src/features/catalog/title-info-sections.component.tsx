import { useT } from '@kromatv/ui';
import { Box, Section } from '@kromatv/ui/kit';
import { Children, type ReactNode } from 'react';
import { CastField } from '#web/features/catalog/title-cast-field.component';
import { type ReadyInfo, TextEntry } from '#web/features/catalog/title-info-fields.component';
import {
  DirectorsField,
  GenresField,
  StudiosField,
} from '#web/features/catalog/title-names-field.component';

const COLUMN_MIN = 240;

function Pair({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Box row wrap gap={16}>
      {Children.map(children, (child) => (
        <Box flex={1} minW={COLUMN_MIN}>
          {child}
        </Box>
      ))}
    </Box>
  );
}

function Band({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <Section.Root gap={20}>
      <Section.Header>
        <Section.Title>{title}</Section.Title>
      </Section.Header>
      {children}
    </Section.Root>
  );
}

function TextBands({ info }: Readonly<{ info: ReadyInfo }>) {
  const t = useT();
  return (
    <>
      <Band title={t('titleInfo.sectionTitles')}>
        <Pair>
          <TextEntry info={info} field="title" />
          <TextEntry info={info} field="originalTitle" />
        </Pair>
        <TextEntry info={info} field="sortTitle" />
      </Band>
      <Band title={t('titleInfo.sectionRelease')}>
        <Pair>
          <TextEntry info={info} field="released" />
          <TextEntry info={info} field="contentRating" />
        </Pair>
      </Band>
      <Band title={t('titleInfo.sectionDescription')}>
        <TextEntry info={info} field="tagline" />
        <TextEntry info={info} field="overview" />
      </Band>
    </>
  );
}

function NameBands({ info }: Readonly<{ info: ReadyInfo }>) {
  const t = useT();
  return (
    <>
      <Band title={t('titleInfo.sectionGenres')}>
        <GenresField info={info} />
        <StudiosField info={info} />
      </Band>
      <Band title={t('titleInfo.sectionPeople')}>
        <DirectorsField info={info} />
        <CastField info={info} />
      </Band>
    </>
  );
}

/** The fields of a film or a show, in bands: its titles, its release, how it
 * is described, its genres and studios, and the people who made it. */
export function TitleSections({ info }: Readonly<{ info: ReadyInfo }>) {
  return (
    <Box gap={36}>
      <TextBands info={info} />
      <NameBands info={info} />
    </Box>
  );
}

/** The fields of an episode: its name, the day it first aired and its summary. */
export function EpisodeSections({ info }: Readonly<{ info: ReadyInfo }>) {
  const t = useT();
  return (
    <Box gap={20}>
      <TextEntry info={info} field="title" />
      <TextEntry
        info={info}
        field="released"
        label={t('titleInfo.aired')}
        hint={t('titleInfo.airedHint')}
      />
      <TextEntry info={info} field="overview" />
    </Box>
  );
}
