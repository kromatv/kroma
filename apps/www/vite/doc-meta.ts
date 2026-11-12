import { isDocFile } from './doc-links.ts';
import { exportConst } from './mdx-export.ts';

interface MdNode {
  type: string;
  depth?: number;
  value?: string;
  children?: MdNode[];
}

function plain(node: MdNode): string {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value ?? '';
  if (node.type === 'break') return ' ';
  return (node.children ?? []).map(plain).join('');
}

/** Lifts a guide's `# Title` out of its body into `export const title`, and
 *  its first paragraph into `export const description`, so the page draws the
 *  heading itself and the head tags carry both. A guide has no frontmatter,
 *  because GitHub would render it as a table above the text. */
export function remarkDocMeta() {
  return (tree: MdNode, file: { path?: string }) => {
    if (!isDocFile(file.path) || !tree.children) return;
    const at = tree.children.findIndex((n) => n.type === 'heading' && n.depth === 1);
    const heading = at === -1 ? undefined : tree.children.splice(at, 1)[0];
    const lead = tree.children.find((n) => n.type === 'paragraph');
    const description = lead ? plain(lead).replaceAll(/\s+/g, ' ').trim() : '';
    tree.children.unshift(
      exportConst('title', heading ? plain(heading).trim() : ''),
      exportConst('description', description),
    );
  };
}
