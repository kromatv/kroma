use crate::web::Query;

pub(crate) const MAX_PAGE_ROWS: usize = 500;
// Ids travel in the address, and 50 of them keep it near 2 KB.
const LOOKUP_ROWS: usize = 50;

const FILMS_AND_EPISODES: &str = "Movie,Episode";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Window {
    pub(crate) start: usize,
    pub(crate) limit: usize,
}

impl Window {
    pub(crate) fn of(cursor: Option<&str>, limit: Option<usize>) -> anyhow::Result<Self> {
        let start = match cursor {
            Some(cursor) => cursor
                .parse()
                .map_err(|_| anyhow::anyhow!("a cursor this importer did not give"))?,
            None => 0,
        };
        Ok(Self {
            start,
            limit: page_rows(limit),
        })
    }

    pub(crate) fn next(&self, returned: usize) -> Option<usize> {
        (returned >= self.limit).then_some(self.start + returned)
    }
}

pub(crate) fn page_rows(asked: Option<usize>) -> usize {
    asked.unwrap_or(MAX_PAGE_ROWS).clamp(1, MAX_PAGE_ROWS)
}

fn pair(name: &'static str, value: &str) -> (&'static str, String) {
    (name, value.to_string())
}

pub(crate) fn films_and_episodes(user: &str) -> Query {
    vec![
        pair("userId", user),
        pair("recursive", "true"),
        pair("includeItemTypes", FILMS_AND_EPISODES),
        pair("enableImages", "false"),
    ]
}

pub(crate) fn in_library(mut query: Query, library: &str) -> Query {
    query.push(pair("parentId", library));
    query
}

pub(crate) fn with_fields(mut query: Query, fields: &str) -> Query {
    query.push(pair("fields", fields));
    query.push(pair("enableUserData", "false"));
    query
}

pub(crate) fn with_user_data(mut query: Query) -> Query {
    query.push(pair("enableUserData", "true"));
    query
}

pub(crate) fn filtered(mut query: Query, filters: &str) -> Query {
    query.push(pair("filters", filters));
    query
}

pub(crate) fn paged(mut query: Query, window: Window) -> Query {
    // A title added during an import lands after the pages already read.
    query.push(pair("sortBy", "DateCreated,SortName"));
    query.push(pair("sortOrder", "Ascending"));
    query.push(pair("startIndex", &window.start.to_string()));
    query.push(pair("limit", &window.limit.to_string()));
    query.push(pair("enableTotalRecordCount", "false"));
    query
}

pub(crate) fn counted(mut query: Query) -> Query {
    query.push(pair("enableUserData", "false"));
    query.push(pair("limit", "0"));
    query.push(pair("enableTotalRecordCount", "true"));
    query
}

pub(crate) fn playlists(user: &str) -> Query {
    vec![
        pair("userId", user),
        pair("recursive", "true"),
        pair("includeItemTypes", "Playlist"),
        pair("enableImages", "false"),
    ]
}

pub(crate) fn by_ids(user: &str, ids: &[String], fields: &str) -> Vec<Query> {
    ids.chunks(LOOKUP_ROWS)
        .map(|chunk| {
            let named = vec![
                pair("userId", user),
                pair("ids", &chunk.join(",")),
                pair("enableImages", "false"),
            ];
            with_fields(named, fields)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_page_starts_at_zero_and_asks_for_what_the_core_asked() {
        let window = Window::of(None, Some(200)).unwrap();

        assert_eq!(
            window,
            Window {
                start: 0,
                limit: 200
            }
        );
    }

    #[test]
    fn a_page_is_never_larger_than_five_hundred_rows_nor_empty_by_request() {
        let large = Window::of(None, Some(9_000)).unwrap();
        let none = Window::of(None, Some(0)).unwrap();
        let unsaid = Window::of(None, None).unwrap();

        assert_eq!((large.limit, none.limit, unsaid.limit), (500, 1, 500));
    }

    #[test]
    fn a_full_page_names_the_next_one_and_a_short_page_is_the_last() {
        let window = Window::of(Some("500"), Some(500)).unwrap();

        assert_eq!(window.next(500), Some(1000));
        assert_eq!(window.next(499), None);
    }

    #[test]
    fn a_cursor_that_is_not_one_of_ours_is_refused() {
        let window = Window::of(Some("c-1"), None);

        assert!(window.is_err());
    }

    #[test]
    fn a_lookup_of_many_ids_is_split_in_calls_of_fifty() {
        let ids: Vec<String> = (0..120).map(|n| format!("id{n}")).collect();

        let calls = by_ids("u1", &ids, "ProviderIds");

        assert_eq!(calls.len(), 3);
        assert_eq!(calls[2][1].1.split(',').count(), 20);
    }
}
