//! One table row, as JSON and back.

use anyhow::Result;
use rusqlite::Connection;
use serde_json::{Map, Value};

use super::{SqlValue, ValueRef};

// Run `sql` and map every row to a `{column: value}` JSON object.
pub(super) fn dump_query(conn: &Connection, sql: &str) -> Result<Vec<Map<String, Value>>> {
    let mut stmt = conn.prepare(sql)?;
    let cols: Vec<String> = stmt.column_names().into_iter().map(String::from).collect();
    let mut rows = stmt.query([])?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        let mut obj = Map::new();
        for (i, col) in cols.iter().enumerate() {
            obj.insert(col.clone(), sql_to_json(row.get_ref(i)?));
        }
        out.push(obj);
    }
    Ok(out)
}

// `INSERT OR REPLACE` each row into `table` (replace-by-primary-key). Column
// names are validated as plain identifiers before interpolation.
pub(super) fn restore_rows(conn: &Connection, table: &str, rows: &[Map<String, Value>]) -> Result<usize> {
    let mut written = 0;
    for row in rows {
        let cols: Vec<&String> = row.keys().filter(|c| is_ident(c)).collect();
        if cols.is_empty() {
            continue;
        }
        let col_list = cols.iter().map(|c| format!("\"{c}\"")).collect::<Vec<_>>().join(",");
        let placeholders = (1..=cols.len()).map(|i| format!("?{i}")).collect::<Vec<_>>().join(",");
        let sql = format!("INSERT OR REPLACE INTO \"{table}\" ({col_list}) VALUES ({placeholders})");
        let values: Vec<SqlValue> = cols.iter().map(|c| json_to_sql(&row[*c])).collect();
        conn.execute(&sql, rusqlite::params_from_iter(values.iter()))?;
        written += 1;
    }
    Ok(written)
}

// SQLite value → JSON. Blobs become a byte array (none of the exported tables
// have blob columns today, but keep it lossless).
pub(super) fn sql_to_json(v: ValueRef<'_>) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => Value::from(f),
        ValueRef::Text(t) => Value::from(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => Value::from(b.to_vec()),
    }
}

// JSON → SQLite value, inverse of [`sql_to_json`]. Stored-JSON text columns
// (`settings.value`, `permissions`, …) round-trip as `Text`.
pub(super) fn json_to_sql(v: &Value) -> SqlValue {
    match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(*b as i64),
        Value::Number(n) => n
            .as_i64()
            .map(SqlValue::Integer)
            .unwrap_or_else(|| SqlValue::Real(n.as_f64().unwrap_or(0.0))),
        Value::String(s) => SqlValue::Text(s.clone()),
        Value::Array(a) => SqlValue::Blob(a.iter().filter_map(|x| x.as_u64().map(|n| n as u8)).collect()),
        Value::Object(_) => SqlValue::Text(v.to_string()),
    }
}

// A safe SQL identifier (`[A-Za-z0-9_]+`) guards interpolated column names.
pub(super) fn is_ident(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backup::import_portable;
    use crate::backup::test_support::*;

    #[test]
    fn a_row_whose_columns_are_all_unsafe_identifiers_is_skipped() {
        let dst = fresh_pool("idents");
        let mut doc = empty_doc();
        doc.tables.insert(
            "users".into(),
            vec![Map::from_iter([("id); DROP TABLE users --".to_string(), Value::from("u1"))])],
        );
        assert_eq!(import_portable(&dst, &data_dir(&dst), &doc, false).unwrap(), vec![("users".to_string(), 0)]);
        assert_eq!(count(&dst, "users"), 0);
    }

    #[test]
    fn every_json_value_kind_maps_onto_a_sqlite_value() {
        assert_eq!(json_to_sql(&Value::Null), SqlValue::Null);
        assert_eq!(json_to_sql(&Value::Bool(true)), SqlValue::Integer(1));
        assert_eq!(json_to_sql(&Value::Bool(false)), SqlValue::Integer(0));
        assert_eq!(json_to_sql(&serde_json::json!(42)), SqlValue::Integer(42));
        assert_eq!(json_to_sql(&serde_json::json!(1.5)), SqlValue::Real(1.5));
        assert_eq!(json_to_sql(&serde_json::json!("hi")), SqlValue::Text("hi".into()));
        assert_eq!(json_to_sql(&serde_json::json!([1, 2, 255])), SqlValue::Blob(vec![1, 2, 255]));
        assert_eq!(
            json_to_sql(&serde_json::json!({ "a": 1 })),
            SqlValue::Text(r#"{"a":1}"#.into())
        );
    }

    #[test]
    fn every_sqlite_value_kind_survives_the_dump_as_json() {
        let pool = crate::testing::temp_pool("bkp-values");
        let conn = pool.get().unwrap();
        conn.execute_batch(
            "CREATE TABLE v (i INTEGER, r REAL, t TEXT, b BLOB, n TEXT);\
             INSERT INTO v VALUES (7, 1.5, 'text', x'00ff', NULL);",
        )
        .unwrap();

        let rows = dump_query(&conn, "SELECT * FROM v").unwrap();
        assert_eq!(rows[0]["i"], Value::from(7));
        assert_eq!(rows[0]["r"], Value::from(1.5));
        assert_eq!(rows[0]["t"], Value::from("text"));
        assert_eq!(rows[0]["b"], serde_json::json!([0, 255]));
        assert_eq!(rows[0]["n"], Value::Null);
    }
}
