import { formatMonth } from '#site/lib/day';
import { useLang } from '#site/lib/i18n';
import { m } from '#site/paraglide/messages';

export interface MonthHeadingProps {
  /** `2026-08`, or null for the builds that carry no date. */
  month: string | null;
}

/** The month a run of builds was made in: what turns a list of thirty-six
 *  versions into a history a reader can scan. */
export function MonthHeading({ month }: Readonly<MonthHeadingProps>) {
  const lang = useLang();

  return (
    <h4 className="pb-2 pt-6 font-sans text-xs font-bold uppercase tracking-wider text-dim first:pt-0">
      {month ? formatMonth(month, lang) : m.archive_undated()}
    </h4>
  );
}
