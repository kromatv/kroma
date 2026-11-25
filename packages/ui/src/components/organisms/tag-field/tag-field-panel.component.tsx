import type { EntryKey } from '#ui/components/organisms/suggestions/suggestion-keys.hook';
import { SuggestionPanel } from '#ui/components/organisms/suggestions/suggestion-panel.component';
import type { TagFieldControl } from './tag-field-context';
import type { TagFieldSurfaceProps } from './tag-field-surface';

function tagKeys(control: TagFieldControl): Readonly<Record<string, EntryKey>> {
  return {
    Backspace: () => {
      const last = control.value.at(-1);
      return control.query === '' && last !== undefined && control.remove(last);
    },
  };
}

/** The pointer's presentation: a text entry after the tags, and the
 *  suggestions in a list anchored under the well, driven from the entry.
 *  Backspace in an empty entry takes the last tag out. */
function TagFieldPanel({ surface, control, tags }: Readonly<TagFieldSurfaceProps>) {
  return (
    <SuggestionPanel
      surface={surface}
      lead={tags}
      filled={tags.length > 0}
      keys={tagKeys(control)}
    />
  );
}

export { TagFieldPanel };
