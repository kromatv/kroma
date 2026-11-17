import type { ProposalView } from '#site/lib/views';
import type { Confirm, Edit, Start, Store, User } from '#site/store/store';

/** What the viewer holds in one language of a project: edits, confirms, the start of the language, and their open pull request. */
export interface Work {
  edits: Edit[];
  confirms: Confirm[];
  start: Start | null;
  proposal: ProposalView | null;
}

/** The viewer's work in `locale` of `project`, none for a visitor. */
export async function viewerWork(
  store: Store,
  project: string,
  viewer: User | null,
  locale: string,
): Promise<Work> {
  if (!viewer) return { edits: [], confirms: [], start: null, proposal: null };
  const [edits, confirms, starts, proposal] = await Promise.all([
    store.edits(project, viewer.id, locale),
    store.confirms(project, viewer.id, locale),
    store.starts(project, viewer.id),
    store.proposal(project, viewer.id, locale),
  ]);
  const start = starts.find((s) => s.locale === locale) ?? null;
  return {
    edits,
    confirms,
    start,
    proposal: proposal ? { number: proposal.prNumber, url: proposal.prUrl } : null,
  };
}

/** How many pieces of `work` wait to be sent, and how many ride in the pull request. */
export function pendingOf(work: Work): { drafts: number; proposed: number } {
  const all = [...work.edits, ...work.confirms, ...(work.start ? [work.start] : [])];
  return {
    drafts: all.filter((w) => !w.proposed).length,
    proposed: all.filter((w) => w.proposed).length,
  };
}
