use anyhow::{anyhow, Result};

use crate::server::Window;
use crate::xml::Element;

pub(crate) const MAX_ROWS: u64 = 500;

/// The window a page ask names. A cursor is the offset this importer gave as
/// `next`, and no cursor is the first page.
pub(crate) fn window(cursor: Option<&str>, limit: Option<u64>) -> Result<Window> {
    let start = match cursor {
        None => 0,
        Some(cursor) => cursor
            .parse()
            .map_err(|_| anyhow!("a cursor this importer did not give"))?,
    };
    Ok(Window {
        start,
        size: limit.unwrap_or(MAX_ROWS).clamp(1, MAX_ROWS),
    })
}

/// The cursor of the page after `page`, or `None` on the last one. It counts
/// what the server sent, not the rows kept from it, so a page of rows that were
/// all skipped still leads to the next.
pub(crate) fn next(window: Window, page: &Element) -> Option<String> {
    let sent = page.children().len() as u64;
    let end = window.start + sent;
    let more = match page.number::<u64>("totalSize") {
        Some(total) => end < total,
        None => sent >= window.size,
    };
    (sent > 0 && more).then(|| end.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn page(xml: &str) -> Element {
        Element::parse(xml.as_bytes()).unwrap()
    }

    #[test]
    fn the_first_page_starts_at_zero_and_asks_for_no_more_than_five_hundred() {
        let unbounded = window(None, None).unwrap();
        let greedy = window(None, Some(9_000)).unwrap();
        let empty = window(None, Some(0)).unwrap();

        assert_eq!(
            unbounded,
            Window {
                start: 0,
                size: 500
            }
        );
        assert_eq!(greedy.size, 500);
        assert_eq!(empty.size, 1);
    }

    #[test]
    fn a_cursor_is_the_offset_of_the_page_it_asks_for() {
        let later = window(Some("1500"), Some(250)).unwrap();

        assert_eq!(
            later,
            Window {
                start: 1500,
                size: 250
            }
        );
    }

    #[test]
    fn refuses_a_cursor_it_did_not_give() {
        let asked = window(Some("after-p2"), None);

        assert!(asked.is_err());
    }

    #[test]
    fn a_page_short_of_the_total_leads_to_the_next_one() {
        let first = page(r#"<MediaContainer totalSize="3"><Video/><Video/></MediaContainer>"#);
        let last = page(r#"<MediaContainer totalSize="3"><Video/></MediaContainer>"#);

        let after_first = next(Window { start: 0, size: 2 }, &first);
        let after_last = next(Window { start: 2, size: 2 }, &last);

        assert_eq!(after_first.as_deref(), Some("2"));
        assert_eq!(after_last, None);
    }

    #[test]
    fn a_full_page_with_no_total_leads_to_the_next_one() {
        let full = page("<MediaContainer><Video/><Video/></MediaContainer>");
        let short = page("<MediaContainer><Video/></MediaContainer>");

        let after_full = next(Window { start: 4, size: 2 }, &full);
        let after_short = next(Window { start: 6, size: 2 }, &short);

        assert_eq!(after_full.as_deref(), Some("6"));
        assert_eq!(after_short, None);
    }

    #[test]
    fn an_empty_page_is_the_last_whatever_the_total_says() {
        let empty = page(r#"<MediaContainer totalSize="900"/>"#);

        let after = next(
            Window {
                start: 500,
                size: 500,
            },
            &empty,
        );

        assert_eq!(after, None);
    }
}
