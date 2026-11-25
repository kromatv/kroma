import type { ReactNode } from 'react';
import {
  SuggestionEmpty,
  SuggestionHint,
  SuggestionMedia,
  type SuggestionMediaProps,
} from '#ui/components/organisms/suggestions/suggestion-parts.component';

type TagFieldMediaProps = SuggestionMediaProps;

/** The mark of a name: a face, a logo or a glyph. Inside a <TagField.Tag> or a
 *  <TagField.Item>, which size it (a tag's mark is smaller than a row's) and
 *  give it the name its initials are drawn from. It takes the corner of what
 *  holds it less the inset, so the two stay concentric. */
function Media(props: Readonly<TagFieldMediaProps>) {
  return <SuggestionMedia {...props} />;
}

/** The second line of a <TagField.Item>: what tells two of the same name
 *  apart, as a job and a known work. */
function Hint({ children }: Readonly<{ children?: ReactNode }>) {
  return <SuggestionHint>{children}</SuggestionHint>;
}

/** What the list says once something is typed and nothing is left to suggest.
 *  The row that adds the typed text as it is stays under it. */
function Empty({ children }: Readonly<{ children?: ReactNode }>) {
  return <SuggestionEmpty>{children}</SuggestionEmpty>;
}

export type { TagFieldMediaProps };
export { Empty, Hint, Media };
