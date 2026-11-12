type Kind = 'note' | 'tip' | 'important' | 'warning' | 'caution';

const LABELS: Record<'en' | 'fr', Record<Kind, string>> = {
  en: { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' },
  fr: {
    note: 'Remarque',
    tip: 'Astuce',
    important: 'Important',
    warning: 'Attention',
    caution: 'Prudence',
  },
};

const MARKER = /^\[!(note|tip|important|warning|caution)\][^\S\n]*\n?/i;

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: Record<string, unknown>;
}

const langOf = (path: string | undefined): 'en' | 'fr' =>
  /\.fr\.mdx?$/.test(path ?? '') ? 'fr' : 'en';

function toCallout(quote: MdNode, lang: 'en' | 'fr') {
  const first = quote.children?.[0];
  const lead = first?.type === 'paragraph' ? first.children?.[0] : undefined;
  const match = lead?.type === 'text' ? MARKER.exec(lead.value ?? '') : null;
  if (!first || !lead || !match) return;
  const kind = match[1]?.toLowerCase() as Kind;
  lead.value = (lead.value ?? '').slice(match[0].length);
  if (lead.value === '') first.children?.shift();
  if (first.children?.[0]?.type === 'break') first.children.shift();
  if (first.children?.length === 0) quote.children?.shift();
  quote.data = { hName: 'aside', hProperties: { className: ['callout', `callout-${kind}`] } };
  quote.children?.unshift({
    type: 'paragraph',
    data: { hProperties: { className: ['callout-title'] } },
    children: [{ type: 'text', value: LABELS[lang][kind] }],
  });
}

function visit(node: MdNode, fn: (node: MdNode) => void) {
  for (const child of node.children ?? []) visit(child, fn);
  fn(node);
}

/** GitHub's alert syntax (`> [!NOTE]`, `> [!WARNING]`, ...) as the site's
 *  callout: an `aside.callout.callout-<kind>` led by a title in the file's
 *  language, so a guide reads the same on GitHub and on the site. */
export function remarkAlerts() {
  return (tree: MdNode, file: { path?: string }) => {
    const lang = langOf(file.path);
    visit(tree, (node) => {
      if (node.type === 'blockquote') toCallout(node, lang);
    });
  };
}
