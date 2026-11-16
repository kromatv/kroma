import { type StyleDecl, svFor } from '@kromatv/ui/kit';
import { Box, Row } from '@kromatv/ui/kit/atoms/box';
import { Focusable } from '@kromatv/ui/kit/atoms/focusable';
import { Icon } from '@kromatv/ui/kit/atoms/icon';
import { Text } from '@kromatv/ui/kit/atoms/text';
import type { ReactElement, ReactNode } from 'react';
import { RouteLink } from '#site/components/route-link.component';
import { projectParams } from '#site/lib/project-id';

const crumb = svFor<{ root: StyleDecl; label: StyleDecl }>()({
  slots: {
    root: { minH: 28, justify: 'center', px: 4, mx: -4, radius: 'sm' },
    label: { color: 'textMuted', _hover: { color: 'text' } },
  },
});

function Crumb({
  label,
  children,
}: Readonly<{ label: string; children: (face: ReactNode) => ReactElement }>) {
  return (
    <Focusable sv={crumb} asChild>
      {({ slots }) =>
        children(
          <Text variant="meta" style={slots.label}>
            {label}
          </Text>,
        )
      }
    </Focusable>
  );
}

function Step() {
  return <Icon name="chevron-right" size={14} color="textDim" />;
}

function Here({ children }: Readonly<{ children: string }>) {
  return (
    <Box shrink={1} minW={0} aria-current="page">
      <Text variant="meta" color="text" lines={1}>
        {children}
      </Text>
    </Box>
  );
}

function ProjectStep({ project, here }: Readonly<{ project: string; here: boolean }>) {
  if (here) {
    return <Here>{project}</Here>;
  }
  return (
    <Crumb label={project}>
      {(face) => (
        <RouteLink to="/$owner/$repo" params={projectParams(project)}>
          {face}
        </RouteLink>
      )}
    </Crumb>
  );
}

function LanguageStep({
  project,
  language,
  here,
}: Readonly<{ project: string; language: { tag: string; name: string }; here: boolean }>) {
  if (here) {
    return <Here>{language.name}</Here>;
  }
  return (
    <Crumb label={language.name}>
      {(face) => (
        <RouteLink
          to="/$owner/$repo/$locale"
          params={{ ...projectParams(project), locale: language.tag }}
        >
          {face}
        </RouteLink>
      )}
    </Crumb>
  );
}

/**
 * Where a project page sits: Projects, then the project, the language and the
 * section it is under, each a link, and the page itself last. `language` and
 * `section` are left out above the depth the page is at.
 */
export function Trail({
  project,
  language,
  section,
}: Readonly<{ project: string; language?: { tag: string; name: string }; section?: string }>) {
  return (
    <Row gap={6} align="center" wrap role="navigation" aria-label="Breadcrumb">
      <Crumb label="Projects">{(face) => <RouteLink to="/">{face}</RouteLink>}</Crumb>
      <Step />
      <ProjectStep project={project} here={language === undefined} />
      {language ? <Step /> : null}
      {language ? (
        <LanguageStep project={project} language={language} here={section === undefined} />
      ) : null}
      {section === undefined ? null : <Step />}
      {section === undefined ? null : <Here>{section}</Here>}
    </Row>
  );
}
