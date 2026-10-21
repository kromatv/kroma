use crate::model::{ElementCounts, ElementRow};

pub struct Filter {
    // `"all" | "attention" | "ok" | "pending" | "running" | "failed"`.
    pub status: String,
    // `"all" | "film" | "series" | "episode"`.
    pub kind: String,
    pub query: String,
    pub page: i64,
    pub limit: i64,
}

pub(super) fn tally_counts(all: &[ElementRow]) -> ElementCounts {
    let mut counts = ElementCounts {
        total: all.len() as i64,
        ..Default::default()
    };
    for el in all {
        match el.overall.as_str() {
            "ok" => counts.ok += 1,
            "pending" => counts.pending += 1,
            "running" => counts.running += 1,
            "failed" => counts.failed += 1,
            _ => {}
        }
        match el.kind.as_str() {
            "film" => counts.film += 1,
            "series" => counts.series += 1,
            "episode" => counts.episode += 1,
            _ => {}
        }
    }
    counts
}

// `q` is already trimmed + lowercased.
pub(super) fn matches_filter(el: &ElementRow, f: &Filter, q: &str) -> bool {
    if !q.is_empty() && !el.title.to_lowercase().contains(q) {
        return false;
    }
    if f.kind != "all" && el.kind != f.kind {
        return false;
    }
    match f.status.as_str() {
        "all" => true,
        "attention" => el.overall != "ok",
        other => el.overall == other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(kind: &str, overall: &str) -> ElementRow {
        ElementRow {
            id: "id1".into(),
            kind: kind.into(),
            title: "The Matrix".into(),
            poster: None,
            year: None,
            genre: None,
            duration_ms: None,
            season_count: None,
            treatments: Vec::new(),
            overall: overall.into(),
            ep_stats: None,
        }
    }

    #[test]
    fn tally_counts_rolls_up_status_and_kind() {
        let all = vec![
            row("film", "ok"),
            row("film", "failed"),
            row("series", "pending"),
            row("episode", "running"),
        ];
        let c = tally_counts(&all);
        assert_eq!(c.total, 4);
        assert_eq!((c.ok, c.failed, c.pending, c.running), (1, 1, 1, 1));
        assert_eq!((c.film, c.series, c.episode), (2, 1, 1));
    }

    #[test]
    fn a_status_or_kind_the_rollup_does_not_know_is_counted_in_the_total_only() {
        let all = vec![row("film", "blocked"), row("collection", "ok")];
        let c = tally_counts(&all);
        assert_eq!(c.total, 2);
        assert_eq!((c.ok, c.failed, c.pending, c.running), (1, 0, 0, 0));
        assert_eq!((c.film, c.series, c.episode), (1, 0, 0));
    }

    #[test]
    fn matches_filter_query_kind_and_status() {
        let f = |status: &str, kind: &str, query: &str| Filter {
            status: status.into(),
            kind: kind.into(),
            query: query.into(),
            page: 0,
            limit: 50,
        };
        let el = row("film", "failed"); // title "The Matrix"

        assert!(matches_filter(&el, &f("all", "all", ""), ""));
        assert!(matches_filter(&el, &f("all", "all", "matrix"), "matrix"));
        assert!(!matches_filter(
            &el,
            &f("all", "all", "inception"),
            "inception"
        ));

        assert!(!matches_filter(&el, &f("all", "series", ""), ""));
        assert!(matches_filter(&el, &f("all", "film", ""), ""));

        assert!(matches_filter(&el, &f("failed", "all", ""), ""));
        assert!(!matches_filter(&el, &f("ok", "all", ""), ""));
        assert!(matches_filter(&el, &f("attention", "all", ""), ""));
        assert!(!matches_filter(
            &row("film", "ok"),
            &f("attention", "all", ""),
            ""
        ));
    }
}
