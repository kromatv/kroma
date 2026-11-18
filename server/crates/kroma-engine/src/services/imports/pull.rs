//! Reading an importer page by page.

use std::collections::HashSet;

use super::halt::Halt;

/// Calls `page` with no cursor, then with the cursor each call returns, until
/// one returns none. A cursor the importer already gave in this read would
/// read the same pages for ever, so it ends the read with
/// [`Halt::RepeatedCursor`].
pub(super) fn each_page(
    mut page: impl FnMut(Option<&str>) -> Result<Option<String>, Halt>,
) -> Result<(), Halt> {
    let mut given = HashSet::new();
    let mut cursor: Option<String> = None;
    loop {
        let Some(next) = page(cursor.as_deref())? else {
            return Ok(());
        };
        if !given.insert(next.clone()) {
            return Err(Halt::RepeatedCursor);
        }
        cursor = Some(next);
    }
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;

    use super::*;

    fn following(answers: &[Option<&str>]) -> (Result<(), Halt>, Vec<Option<String>>) {
        let asked = RefCell::new(Vec::new());
        let mut answers = answers.iter();

        let read = each_page(|cursor| {
            asked.borrow_mut().push(cursor.map(str::to_string));
            Ok(answers.next().copied().flatten().map(str::to_string))
        });

        (read, asked.into_inner())
    }

    #[test]
    fn a_read_asks_for_each_page_with_the_cursor_the_page_before_gave() {
        let (read, asked) = following(&[Some("c-2"), Some("c-3"), None]);

        assert!(read.is_ok());
        assert_eq!(
            asked,
            vec![None, Some("c-2".to_string()), Some("c-3".to_string())]
        );
    }

    #[test]
    fn a_cursor_given_twice_in_a_row_ends_the_read_as_an_error() {
        let (read, asked) = following(&[Some("c-2"), Some("c-2"), Some("c-2")]);

        assert!(matches!(read, Err(Halt::RepeatedCursor)));
        assert_eq!(asked.len(), 2);
    }

    #[test]
    fn a_cursor_that_comes_back_after_others_ends_the_read_as_an_error() {
        let (read, asked) = following(&[Some("a"), Some("b"), Some("a"), Some("b")]);

        assert!(matches!(read, Err(Halt::RepeatedCursor)));
        assert_eq!(asked.len(), 3);
    }

    #[test]
    fn a_page_that_fails_ends_the_read_with_its_own_reason() {
        let read = each_page(|_| Err(Halt::Cancelled));

        assert!(matches!(read, Err(Halt::Cancelled)));
    }
}
