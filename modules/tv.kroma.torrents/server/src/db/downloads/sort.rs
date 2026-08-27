/// The column the queue is ordered by. Named for the table column an operator
/// clicks, not for the ledger column behind it.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum DownloadSort {
    Release,
    Progress,
    Status,
    #[default]
    Added,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum SortDirection {
    Ascending,
    #[default]
    Descending,
}

/// How a page of the queue is ordered. Every spelling of it is fixed at compile
/// time: the wire carries a name, the name selects a variant, and the variant
/// selects the SQL. No caller string ever reaches the statement.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct DownloadOrder {
    pub sort: DownloadSort,
    pub direction: SortDirection,
}

impl DownloadSort {
    fn parse(raw: &str) -> Option<Self> {
        Some(match raw.trim() {
            "release" => Self::Release,
            "progress" => Self::Progress,
            "status" => Self::Status,
            "added" => Self::Added,
            _ => return None,
        })
    }

    fn expression(self) -> &'static str {
        match self {
            // Mirrors `routes::view::display_title`: the linked request names
            // the row, then a pinned title, then the scene string. Sorting by
            // anything else orders by a name the column does not show.
            Self::Release => {
                "COALESCE(\
                 NULLIF((SELECT r.title FROM requests r WHERE r.id = downloads.request_id), ''), \
                 NULLIF(CASE WHEN tmdb_id != 0 THEN title END, ''), \
                 release_title) COLLATE NOCASE"
            }
            Self::Progress => "progress",
            Self::Status => "status",
            Self::Added => "grabbed_at",
        }
    }
}

impl SortDirection {
    fn parse(raw: &str) -> Option<Self> {
        Some(match raw.trim() {
            "asc" => Self::Ascending,
            "desc" => Self::Descending,
            _ => return None,
        })
    }

    fn keyword(self) -> &'static str {
        match self {
            Self::Ascending => "ASC",
            Self::Descending => "DESC",
        }
    }
}

impl DownloadOrder {
    /// The order a query string asked for. Each half falls back on its own, so
    /// a name nobody defined orders by the default rather than failing the
    /// request.
    pub fn parse(sort: Option<&str>, direction: Option<&str>) -> Self {
        Self {
            sort: sort.and_then(DownloadSort::parse).unwrap_or_default(),
            direction: direction.and_then(SortDirection::parse).unwrap_or_default(),
        }
    }

    // `id` breaks the tie, so two rows sharing a value keep one order across
    // pages instead of trading places between two requests.
    pub(super) fn clause(self) -> String {
        format!(
            "ORDER BY {} {}, id DESC",
            self.sort.expression(),
            self.direction.keyword()
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_hostile_sort_value_never_reaches_the_clause() {
        let injected = DownloadOrder::parse(Some("grabbed_at; DROP TABLE downloads --"), None);
        let unknown = DownloadOrder::parse(Some("release_title"), Some("sideways"));

        assert_eq!(injected, DownloadOrder::default());
        assert_eq!(unknown.clause(), DownloadOrder::default().clause());
        assert!(!injected.clause().contains("DROP"));
    }

    #[test]
    fn every_clause_is_built_from_the_variants_and_nothing_else() {
        let clauses: Vec<String> = [
            DownloadSort::Release,
            DownloadSort::Progress,
            DownloadSort::Status,
            DownloadSort::Added,
        ]
        .into_iter()
        .flat_map(|sort| {
            [SortDirection::Ascending, SortDirection::Descending]
                .into_iter()
                .map(move |direction| DownloadOrder { sort, direction }.clause())
        })
        .collect();

        assert_eq!(clauses.len(), 8);
        assert!(clauses.iter().all(|c| c.ends_with(", id DESC")));
        assert!(clauses.contains(&"ORDER BY progress ASC, id DESC".to_string()));
    }

    #[test]
    fn the_default_order_is_the_newest_grab_first() {
        let asked = DownloadOrder::parse(None, None);

        assert_eq!(asked.sort, DownloadSort::Added);
        assert_eq!(asked.clause(), "ORDER BY grabbed_at DESC, id DESC");
    }

    #[test]
    fn a_named_column_and_direction_are_taken_as_asked() {
        let asked = DownloadOrder::parse(Some(" status "), Some("asc"));

        assert_eq!(asked.sort, DownloadSort::Status);
        assert_eq!(asked.clause(), "ORDER BY status ASC, id DESC");
    }
}
