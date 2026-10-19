import { LiveAnnounce } from '#ui/lib/live-announce';

/** Says `text` to a screen reader each time it changes, and nothing while it
 *  is empty. The live region stays mounted while the bar comes and goes. */
export function Announce({ text }: Readonly<{ text: string }>) {
  return <LiveAnnounce text={text} />;
}
