import { z } from 'zod';
import { ReaderBox, ReaderClip } from './schemas';

const KitNode = z.object({
  name: z.string(),
  props: z.record(z.string(), z.unknown()),
  box: ReaderBox.nullable(),
  clipped: ReaderClip.optional(),
  get children() {
    return z.array(KitNode);
  },
});

type KitNode = z.infer<typeof KitNode>;

const ScreenTree = z.object({ nodes: z.array(KitNode) });

const TAG = /^\[(?:function|element|object|symbol|bigint|array \d+)\]$/;
const SUMMARY_CUT = 120;

/** A text the box it sits in cuts: what it says when its props carry it
 *  whole as one string, where it is, and how much of it is cut. */
export interface PageClip {
  text: string | null;
  box: ReaderBox | null;
  clipped: ReaderClip;
}

function textOf(children: unknown): string | null {
  if (typeof children !== 'string' || TAG.test(children)) {
    return null;
  }
  return children.length >= SUMMARY_CUT && children.endsWith('…') ? null : children;
}

function clipOf(node: KitNode): PageClip[] {
  if (!node.clipped) {
    return [];
  }
  return [{ text: textOf(node.props.children), box: node.box, clipped: node.clipped }];
}

/** Every clipped text of what `describeScreen()` answered, in document order. */
export function clipsOf(answer: unknown): PageClip[] {
  const pending = [...ScreenTree.parse(answer).nodes].reverse();
  const clips: PageClip[] = [];
  for (let node = pending.pop(); node; node = pending.pop()) {
    clips.push(...clipOf(node));
    pending.push(...[...node.children].reverse());
  }
  return clips;
}
