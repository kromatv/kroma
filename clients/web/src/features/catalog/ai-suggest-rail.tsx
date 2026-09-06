// The per-title "Suggestions IA" rail on a detail page. `useAiSuggest` polls the
// lazily-generated section; while it generates we show a progress ring, and once
// items arrive we render them in the same Poster/Rail as the home + similar rails.

import type { ItemId } from '@kroma/client/media';
import { useAiSuggest, useT } from '@kroma/ui';
import { Box, classes, ProgressRing, Row, styles, Text } from '@kroma/ui/kit';
import { SectionPoster } from '#web/features/catalog/cards';
import { useAuth } from '#web/shared/lib/auth';
import { PosterRail, page } from '#web/shared/ui';

// The page gutter is a fluid CSS custom property, which no style number can
// carry, so anything indented by it stays a plain element.

const s = styles({ section: { mt: 44 } });

export function AiSuggestRail({ id }: Readonly<{ id: ItemId }>) {
  const t = useT();
  const { ready, user, client } = useAuth();
  const { section, pending, progress } = useAiSuggest(client, id, { active: ready && !!user });

  if (section && section.items.length > 0) {
    return (
      <section className={classes(s.section)}>
        <h2 className={classes(page.gutter)}>
          <Text variant="h2" mb={4}>
            {section.title}
          </Text>
        </h2>
        {section.reason ? (
          <div className={classes(page.gutter)}>
            <Text variant="meta" color="white/45" mb={16}>
              {section.reason}
            </Text>
          </div>
        ) : (
          <Box mb={12} />
        )}
        <div className={classes(page.gutter)}>
          <PosterRail
            data={section.items}
            renderItem={(entry) => <SectionPoster entry={entry} />}
          />
        </div>
      </section>
    );
  }

  // Still generating → a subtle placeholder so the user knows it's coming.
  // Terminal-empty or gave up → render nothing.
  if (pending) {
    return (
      <section className={classes(s.section)}>
        <h2 className={classes(page.gutter)}>
          <Text variant="h2" mb={4}>
            {t('content.aiSuggestions')}
          </Text>
        </h2>
        <div className={classes(page.gutter)}>
          <Row gap={12} mt={12}>
            <ProgressRing value={progress} />
            <Text variant="meta" color="white/40">
              {t('content.aiSuggestionsLoading')}
            </Text>
          </Row>
        </div>
      </section>
    );
  }
  return null;
}
