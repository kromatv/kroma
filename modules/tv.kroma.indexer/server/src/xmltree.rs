//! A tiny XML DOM + CSS-subset selector for `type: xml` definitions (Torznab /
//! Newznab feeds). `scraper` is HTML-only and mangles namespaced XML, so those
//! responses are parsed here instead. Namespaced tags keep their prefix verbatim.

use quick_xml::events::Event;
use quick_xml::Reader;

/// One XML element (text is flattened into child text nodes).
#[derive(Debug)]
pub struct XmlEl {
    pub name: String,
    pub attrs: Vec<(String, String)>,
    pub children: Vec<XmlNode>,
}

#[derive(Debug)]
pub enum XmlNode {
    Element(XmlEl),
    Text(String),
}

impl XmlEl {
    fn empty_root() -> Self {
        XmlEl {
            name: String::new(),
            attrs: Vec::new(),
            children: Vec::new(),
        }
    }

    /// All descendant text, concatenated + whitespace-normalized.
    pub fn text(&self) -> String {
        let mut out = String::new();
        self.collect_text(&mut out);
        out.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    fn collect_text(&self, out: &mut String) {
        for c in &self.children {
            match c {
                XmlNode::Text(t) => out.push_str(t),
                XmlNode::Element(e) => e.collect_text(out),
            }
        }
    }

    pub fn attr(&self, name: &str) -> Option<&str> {
        self.attrs
            .iter()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.as_str())
    }

    fn child_elements(&self) -> impl Iterator<Item = &XmlEl> {
        self.children.iter().filter_map(|n| match n {
            XmlNode::Element(e) => Some(e),
            XmlNode::Text(_) => None,
        })
    }

    fn descendant_elements<'a>(&'a self, out: &mut Vec<&'a XmlEl>) {
        for e in self.child_elements() {
            out.push(e);
            e.descendant_elements(out);
        }
    }
}

/// Parses into a synthetic root element holding the top-level nodes as children.
pub fn parse(body: &str) -> XmlEl {
    let mut reader = Reader::from_str(body);
    reader.config_mut().trim_text(false);
    let mut stack: Vec<XmlEl> = vec![XmlEl::empty_root()];

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => stack.push(XmlEl {
                name: tag_name(e.name().as_ref()),
                attrs: read_attrs(&e, &reader),
                children: Vec::new(),
            }),
            Ok(Event::Empty(e)) => {
                let el = XmlEl {
                    name: tag_name(e.name().as_ref()),
                    attrs: read_attrs(&e, &reader),
                    children: Vec::new(),
                };
                push_child(&mut stack, el);
            }
            Ok(Event::End(_)) => {
                if stack.len() > 1 {
                    let el = stack.pop().unwrap();
                    push_child(&mut stack, el);
                }
            }
            Ok(Event::Text(t)) => {
                // quick-xml 0.41 emits entities as separate GeneralRef events, so
                // Text carries literal text only (nothing to unescape).
                let s = t.decode().map(|c| c.into_owned()).unwrap_or_default();
                if !s.trim().is_empty() {
                    push_text(&mut stack, s);
                }
            }
            Ok(Event::GeneralRef(r)) => {
                let s = resolve_entity(&r);
                if !s.is_empty() {
                    push_text(&mut stack, s);
                }
            }
            Ok(Event::CData(t)) => {
                let s = String::from_utf8_lossy(t.as_ref()).into_owned();
                push_text(&mut stack, s);
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }
    // Collapse any unclosed elements back into the root.
    while stack.len() > 1 {
        let el = stack.pop().unwrap();
        push_child(&mut stack, el);
    }
    stack.pop().unwrap()
}

fn push_child(stack: &mut [XmlEl], el: XmlEl) {
    if let Some(parent) = stack.last_mut() {
        parent.children.push(XmlNode::Element(el));
    }
}

fn push_text(stack: &mut [XmlEl], s: String) {
    if let Some(parent) = stack.last_mut() {
        parent.children.push(XmlNode::Text(s));
    }
}

fn tag_name(raw: &[u8]) -> String {
    String::from_utf8_lossy(raw).into_owned()
}

fn resolve_entity(r: &quick_xml::events::BytesRef) -> String {
    r.decode()
        .ok()
        .and_then(|name| {
            quick_xml::escape::unescape(&format!("&{name};"))
                .ok()
                .map(|c| c.into_owned())
        })
        .unwrap_or_default()
}

fn read_attrs(e: &quick_xml::events::BytesStart, reader: &Reader<&[u8]>) -> Vec<(String, String)> {
    let decoder = reader.decoder();
    let mut out = Vec::new();
    for a in e.attributes().flatten() {
        let key = String::from_utf8_lossy(a.key.as_ref()).into_owned();
        let val = decoder
            .decode(&a.value)
            .ok()
            .and_then(|d| quick_xml::escape::unescape(&d).ok().map(|c| c.into_owned()))
            .unwrap_or_default();
        out.push((key, val));
    }
    out
}

pub fn select_all<'a>(scope: &'a XmlEl, selector: &str) -> Vec<&'a XmlEl> {
    let steps = parse_selector(selector);
    if steps.is_empty() {
        return Vec::new();
    }
    let mut current: Vec<&XmlEl> = vec![scope];
    for (comb, compound) in &steps {
        let mut next: Vec<&XmlEl> = Vec::new();
        for &el in &current {
            collect_step(el, comb, compound, &mut next);
        }
        current = next;
    }
    current
}

fn collect_step<'a>(el: &'a XmlEl, comb: &Comb, compound: &Compound, next: &mut Vec<&'a XmlEl>) {
    match comb {
        Comb::Descendant => {
            let mut desc = Vec::new();
            el.descendant_elements(&mut desc);
            for d in desc {
                if compound.matches(d) {
                    next.push(d);
                }
            }
        }
        Comb::Child => {
            for c in el.child_elements() {
                if compound.matches(c) {
                    next.push(c);
                }
            }
        }
    }
}

pub fn select_first<'a>(scope: &'a XmlEl, selector: &str) -> Option<&'a XmlEl> {
    select_all(scope, selector).into_iter().next()
}

#[derive(Debug)]
enum Comb {
    Descendant,
    Child,
}

#[derive(Debug, Default)]
struct Compound {
    tag: Option<String>,
    attrs: Vec<(String, Option<String>)>,
    contains: Vec<String>,
}

impl Compound {
    fn matches(&self, el: &XmlEl) -> bool {
        if let Some(tag) = &self.tag {
            if !el.name.eq_ignore_ascii_case(tag) {
                return false;
            }
        }
        for (k, v) in &self.attrs {
            match (el.attr(k), v) {
                (Some(av), Some(want)) if av == want => {}
                (Some(_), None) => {}
                _ => return false,
            }
        }
        if !self.contains.is_empty() {
            let text = el.text();
            if !self.contains.iter().all(|c| text.contains(c.as_str())) {
                return false;
            }
        }
        true
    }
}

fn parse_selector(sel: &str) -> Vec<(Comb, Compound)> {
    let spaced = sel.replace('>', " > ");
    let tokens: Vec<&str> = spaced.split_whitespace().collect();
    let mut out: Vec<(Comb, Compound)> = Vec::new();
    let mut comb = Comb::Descendant;
    for tok in tokens {
        if tok == ">" {
            comb = Comb::Child;
            continue;
        }
        out.push((
            std::mem::replace(&mut comb, Comb::Descendant),
            parse_compound(tok),
        ));
    }
    out
}

fn parse_compound(tok: &str) -> Compound {
    let mut c = Compound::default();
    let chars: Vec<char> = tok.chars().collect();
    let mut i = 0;
    // Leading tag name, namespace prefix included (`torznab:attr`).
    let start = i;
    while i < chars.len() && !matches!(chars[i], '[' | ':') {
        i += 1;
    }
    let tag: String = chars[start..i].iter().collect();
    if !tag.is_empty() && tag != "*" {
        c.tag = Some(tag);
    }
    while i < chars.len() {
        match chars[i] {
            '[' => {
                let Some(next) = parse_attr(&chars, i, &mut c) else {
                    break;
                };
                i = next;
            }
            ':' if chars[i..]
                .iter()
                .collect::<String>()
                .starts_with(":contains(") =>
            {
                parse_contains(&chars, i, &mut c);
                break;
            }
            _ => break,
        }
    }
    c
}

fn parse_attr(chars: &[char], i: usize, c: &mut Compound) -> Option<usize> {
    let close = chars[i..].iter().position(|&x| x == ']').map(|p| i + p)?;
    let inner: String = chars[i + 1..close].iter().collect();
    if let Some((k, v)) = inner.split_once('=') {
        let v = v.trim_matches(|x| x == '"' || x == '\'').to_string();
        c.attrs.push((k.trim().to_string(), Some(v)));
    } else {
        c.attrs.push((inner.trim().to_string(), None));
    }
    Some(close + 1)
}

fn parse_contains(chars: &[char], i: usize, c: &mut Compound) {
    let rest: String = chars[i..].iter().collect();
    if let (Some(open), Some(close)) = (rest.find('('), rest.rfind(')')) {
        let term = rest[open + 1..close]
            .trim()
            .trim_matches(|x| x == '"' || x == '\'');
        if !term.is_empty() {
            c.contains.push(term.to_string());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RSS: &str = r#"<?xml version="1.0"?>
      <rss version="2.0" xmlns:torznab="http://torznab.com/">
      <channel>
        <title>Feed</title>
        <item>
          <title>Obsession 2026 1080p</title>
          <guid>abc123</guid>
          <link>https://x/dl?a=1&amp;b=2</link>
          <category>2000</category>
          <torznab:attr name="seeders" value="305"/>
          <torznab:attr name="size" value="2314321864"/>
        </item>
        <item>
          <title>Other</title>
          <guid>def456</guid>
        </item>
      </channel>
      </rss>"#;

    #[test]
    fn parses_and_selects_rows() {
        let doc = parse(RSS);
        let rows = select_all(&doc, "rss > channel > item");
        assert_eq!(rows.len(), 2);
        assert_eq!(
            select_first(rows[0], "title").unwrap().text(),
            "Obsession 2026 1080p"
        );
        assert_eq!(select_first(rows[0], "guid").unwrap().text(), "abc123");
        assert_eq!(
            select_first(rows[0], "link").unwrap().text(),
            "https://x/dl?a=1&b=2"
        );
    }

    #[test]
    fn attribute_selectors_on_torznab_attr() {
        let doc = parse(RSS);
        let row = select_all(&doc, "item")[0];
        let seeders = select_first(row, "[name=seeders]").unwrap();
        assert_eq!(seeders.attr("value"), Some("305"));
        assert_eq!(
            select_first(row, "torznab\\:attr[name=size]").map(|e| e.attr("value").unwrap()),
            None
        );
        assert_eq!(
            select_first(row, "[name=size]").unwrap().attr("value"),
            Some("2314321864")
        );
    }

    #[test]
    fn descendant_vs_child_combinator() {
        let doc = parse(RSS);
        assert_eq!(select_all(&doc, "channel item").len(), 2);
        assert!(select_all(&doc, "rss > item").is_empty());
        assert_eq!(select_all(&doc, "channel > item").len(), 2);
    }

    #[test]
    fn contains_selector_filters_by_text() {
        let doc = parse(RSS);
        let hit = select_all(&doc, "item:contains(Obsession)");
        assert_eq!(hit.len(), 1);
        assert_eq!(select_first(hit[0], "guid").unwrap().text(), "abc123");
        assert!(select_all(&doc, "item:contains(Nope)").is_empty());
    }

    #[test]
    fn attribute_presence_and_empty_selector() {
        let doc = parse(RSS);
        assert_eq!(select_all(&doc, "[value]").len(), 2);
        assert!(select_all(&doc, "").is_empty());
        assert!(select_first(&doc, "nonexistent").is_none());
    }

    #[test]
    fn text_flattening_and_cdata() {
        let xml = r#"<root><a>  hello   world  </a><b><![CDATA[raw & data]]></b></root>"#;
        let doc = parse(xml);
        assert_eq!(select_first(&doc, "a").unwrap().text(), "hello world");
        assert_eq!(select_first(&doc, "b").unwrap().text(), "raw & data");
    }

    #[test]
    fn unclosed_elements_collapse_into_tree() {
        let xml = r#"<rss><channel><item><title>X 1080p</title>"#;
        let doc = parse(xml);
        let item = select_first(&doc, "item").unwrap();
        assert_eq!(select_first(item, "title").unwrap().text(), "X 1080p");
    }

    #[test]
    fn a_feed_that_stops_being_well_formed_keeps_what_was_read_before_the_break() {
        let xml = r#"<rss><channel><item><title>Good 1080p</title></item></wrong>
          <item><title>Never Read</title></item></channel></rss>"#;
        let doc = parse(xml);
        let items = select_all(&doc, "item");
        assert_eq!(
            items.len(),
            1,
            "the parser must stop at the fault, not restart after it"
        );
        assert_eq!(
            select_first(items[0], "title").unwrap().text(),
            "Good 1080p"
        );
    }

    #[test]
    fn a_contains_with_an_empty_argument_filters_nothing() {
        let doc = parse(RSS);
        assert_eq!(select_all(&doc, "item:contains()").len(), 2);
        assert_eq!(select_all(&doc, r#"item:contains("")"#).len(), 2);
    }

    #[test]
    fn a_contains_the_definition_never_closed_filters_nothing_rather_than_everything() {
        let doc = parse(RSS);
        assert_eq!(select_all(&doc, "item:contains(Alpha").len(), 2);
    }
}
