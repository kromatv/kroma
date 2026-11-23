use serde::Serialize;
use serde_json::{json, Value};

use crate::profiler::{Profiler, Window};
use crate::report::Overview;
use crate::views::SlowReport;

const GUIDE: &str = r#"{
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
}"#;

impl Profiler {
    /// Everything measured over `window` as one file a person or a model can
    /// sort and search: one self-contained JSON record per line, opened by a
    /// `meta` record that names `source` and explains the fields and flags.
    pub fn export(&self, window: Window, source: Value) -> String {
        let overview = self.overview(window);
        let slow: Vec<SlowReport> = self
            .slow_in(window)
            .iter()
            .map(|r| self.slow_report_of(r))
            .collect();
        let mut lines = vec![meta(&overview, source)];
        lines.extend(overview.requests.iter().map(|row| tagged("request", row)));
        lines.extend(overview.jobs.iter().map(|row| tagged("job", row)));
        lines.extend(overview.segments.iter().map(|row| tagged("segment", row)));
        lines.extend(slow.iter().map(|row| tagged("slowRequest", row)));
        lines.iter().map(|line| format!("{line}\n")).collect()
    }
}

fn tagged(kind: &str, row: &impl Serialize) -> Value {
    let mut value = serde_json::to_value(row).unwrap_or(Value::Null);
    if let Value::Object(fields) = &mut value {
        fields.insert("type".into(), Value::String(kind.into()));
    }
    value
}

fn meta(overview: &Overview, source: Value) -> Value {
    let mut meta = json!({
        "type": "meta",
        "source": source,
        "window": overview.window,
        "generatedAtMs": overview.generated_at_ms,
        "enabled": overview.enabled,
    });
    if let (Value::Object(fields), Ok(Value::Object(guide))) =
        (&mut meta, serde_json::from_str(GUIDE))
    {
        fields.extend(guide);
    }
    meta
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::segment::Measured;
    use std::time::Duration;

    #[test]
    fn every_line_of_the_export_is_a_json_record_with_a_type() {
        let profiler = Profiler::new_for_tests();
        let scope = profiler.request("GET", "/api/home").unwrap();
        let entered = scope.enter();
        profiler.record(Measured {
            kind: "sql",
            label: "SELECT * FROM items WHERE id = ?1",
            origin: Some("core"),
            elapsed: Duration::from_millis(3),
        });
        drop(entered);
        profiler.finish(&scope, Some(200), Some(10));

        let file = profiler.export(Window::Hour, json!({ "product": "test" }));

        let records: Vec<Value> = file
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        let types: Vec<&str> = records.iter().map(|r| r["type"].as_str().unwrap()).collect();
        assert_eq!(types, vec!["meta", "request", "segment"]);
        assert!(records[0]["flags"]["n_plus_one"].is_string());
    }
}
