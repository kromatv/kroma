use std::fmt::Write as _;

use serde::Serialize;
use serde_json::{json, Value};

use crate::profiler::{Profiler, Window};
use crate::report::{Overview, ScopeRow, SegmentRow};
use crate::views::SlowReport;

const MD_ROWS: usize = 25;
const MD_LABEL_CHARS: usize = 140;

/// The shape of an export.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Format {
    JsonLines,
    Markdown,
}

impl Profiler {
    /// Everything measured over `window` as one file a person or a model can
    /// sort and search: one self-contained record per line (JSON Lines), or a
    /// ranked Markdown summary. `source` names what was measured and opens the
    /// file.
    pub fn export(&self, window: Window, format: Format, source: Value) -> String {
        let overview = self.overview(window);
        let slow: Vec<SlowReport> = self
            .slow_in(window)
            .iter()
            .map(|r| self.slow_report_of(r))
            .collect();
        match format {
            Format::JsonLines => json_lines(&overview, &slow, source),
            Format::Markdown => markdown(&overview, &slow, &source),
        }
    }
}

fn json_lines(overview: &Overview, slow: &[SlowReport], source: Value) -> String {
    let mut lines = vec![meta(overview, source)];
    lines.extend(overview.requests.iter().map(|row| tagged("request", row)));
    lines.extend(overview.jobs.iter().map(|row| tagged("job", row)));
    lines.extend(overview.segments.iter().map(|row| tagged("segment", row)));
    lines.extend(slow.iter().map(|row| tagged("slowRequest", row)));
    lines
        .into_iter()
        .map(|line| line.to_string())
        .collect::<Vec<_>>()
        .join("\n")
        + "\n"
}

fn tagged(kind: &str, row: &impl Serialize) -> Value {
    let mut value = serde_json::to_value(row).unwrap_or(Value::Null);
    if let Value::Object(fields) = &mut value {
        fields.insert("type".into(), Value::String(kind.into()));
    }
    value
}

fn meta(overview: &Overview, source: Value) -> Value {
    json!({
        "type": "meta",
        "source": source,
        "window": overview.window,
        "generatedAtMs": overview.generated_at_ms,
        "enabled": overview.enabled,
        "units": { "time": "milliseconds", "bytes": "bytes", "atMs": "unix epoch milliseconds" },
        "records": {
            "request": "one HTTP route over the window; parts are the segments one call of it runs, per call",
            "job": "one background job over the window, the same fields as a request",
            "segment": "one SQL statement (kind sql, origin = database), instrumented function (kind span, origin = file:line) or measured call, with the routes and jobs that ran it",
            "slowRequest": "one request slower than 250 ms or repeating a segment 20 times or more, with its waterfall"
        },
        "flags": {
            "n_plus_one": "one call runs the same segment 20 times or more: batch it",
            "slow_p95": "95th percentile over 500 ms for a request, 100 ms for SQL, 250 ms for anything else",
            "cold_outlier": "the slowest call is over a second and ten times the median: a cold cache or a contended lock",
            "large_response": "over 1 MiB per call",
            "server_errors": "answered 5xx at least once",
            "full_scan": "over 1000 full-scan steps per call: an index is missing or unusable",
            "auto_index": "SQLite built a temporary index: the join wants a real one",
            "temp_sort": "sorted in a temporary b-tree on a statement taking over a millisecond"
        },
        "hints": [
            "Sort request and segment records by totalMs to find where the time goes, by p95Ms for what users feel, by maxMs for cold starts",
            "A span's origin is the file:line of the function. A statement has no Rust location: search the repository for a distinctive fragment of its label",
            "Statement labels have lists of placeholders collapsed to ?…; no parameter value is ever recorded"
        ]
    })
}

fn markdown(overview: &Overview, slow: &[SlowReport], source: &Value) -> String {
    let mut out = format!(
        "# Performance report\n\nSource: `{source}`. Window: {}. Times in ms.\n",
        serde_json::to_string(&overview.window).unwrap_or_default()
    );
    let flagged: Vec<&ScopeRow> = overview
        .requests
        .iter()
        .filter(|r| !r.flags.is_empty())
        .collect();
    scope_table(&mut out, "Flagged requests", &flagged);
    scope_table(
        &mut out,
        "Requests by total time",
        &overview.requests.iter().collect::<Vec<_>>(),
    );
    scope_table(
        &mut out,
        "Jobs by total time",
        &overview.jobs.iter().collect::<Vec<_>>(),
    );
    segment_table(&mut out, &overview.segments);
    slow_table(&mut out, slow);
    out
}

fn scope_table(out: &mut String, title: &str, rows: &[&ScopeRow]) {
    let _ = writeln!(out, "\n## {title}\n\n| name | calls | p50 | p95 | max | segments/call | worst repeat | flags |\n|---|---|---|---|---|---|---|---|");
    for row in rows.iter().take(MD_ROWS) {
        let repeat = row.worst_repeat.as_ref().map_or_else(String::new, |r| {
            format!("{}× {}", r.count, short(&r.segment.label))
        });
        let _ = writeln!(
            out,
            "| `{}` | {} | {} | {} | {} | {:.1} | {} | {} |",
            row.name,
            row.spread.count,
            row.spread.p50_ms,
            row.spread.p95_ms,
            row.spread.max_ms,
            row.segments_per_call,
            repeat,
            flags(&row.flags)
        );
    }
}

fn segment_table(out: &mut String, rows: &[SegmentRow]) {
    let _ = writeln!(out, "\n## Segments by total time\n\n| kind | label | origin | calls | total | p95 | rows/call | flags |\n|---|---|---|---|---|---|---|---|");
    for row in rows.iter().take(MD_ROWS) {
        let origin = row.segment.origin.as_deref().unwrap_or("");
        let _ = writeln!(
            out,
            "| {} | `{}` | {} | {} | {} | {} | {:.1} | {} |",
            row.segment.kind,
            short(&row.segment.label),
            origin,
            row.spread.count,
            row.spread.total_ms,
            row.spread.p95_ms,
            row.rows_per_call,
            flags(&row.flags)
        );
    }
}

fn slow_table(out: &mut String, rows: &[SlowReport]) {
    let _ = writeln!(out, "\n## Slow requests\n\n| at (ms) | name | total | segments | top repeat |\n|---|---|---|---|---|");
    for row in rows.iter().rev().take(MD_ROWS) {
        let top = row.repeats.first().map_or_else(String::new, |r| {
            format!("{}× {}", r.count, short(&r.segment.label))
        });
        let _ = writeln!(
            out,
            "| {} | `{}` | {} | {} | {} |",
            row.at_ms, row.name, row.total_ms, row.segments, top
        );
    }
}

fn flags(flags: &[crate::report::Flag]) -> String {
    serde_json::to_value(flags)
        .ok()
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default()
        .iter()
        .filter_map(|v| v.as_str().map(str::to_string))
        .collect::<Vec<_>>()
        .join(", ")
}

fn short(label: &str) -> String {
    let cut: String = label.chars().take(MD_LABEL_CHARS).collect();
    let cut = cut.replace('|', "\\|");
    if label.chars().count() > MD_LABEL_CHARS {
        cut + "…"
    } else {
        cut
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn every_line_of_the_export_is_a_json_record_with_a_type() {
        let profiler = Profiler::new_for_tests();
        let scope = profiler.request("GET", "/api/home").unwrap();
        let entered = scope.enter();
        profiler.record(
            "sql",
            "SELECT * FROM items WHERE id = ?1",
            Some("core"),
            Duration::from_millis(3),
        );
        drop(entered);
        profiler.finish(&scope, Some(200), Some(10));

        let file = profiler.export(
            Window::Hour,
            Format::JsonLines,
            json!({ "product": "test" }),
        );

        let types: Vec<String> = file
            .lines()
            .map(|line| {
                serde_json::from_str::<Value>(line).unwrap()["type"]
                    .as_str()
                    .unwrap()
                    .to_string()
            })
            .collect();
        assert_eq!(types, vec!["meta", "request", "segment"]);
    }

    #[test]
    fn the_markdown_summary_lists_the_route() {
        let profiler = Profiler::new_for_tests();
        let scope = profiler.request("GET", "/api/movies").unwrap();
        profiler.finish(&scope, Some(200), None);

        let file = profiler.export(Window::Hour, Format::Markdown, json!("test"));

        assert!(file.contains("| `GET /api/movies` | 1 |"), "{file}");
    }
}
