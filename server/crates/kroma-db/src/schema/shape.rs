use std::collections::{BTreeMap, BTreeSet};

use rusqlite::Connection;

pub(super) type Column = (String, String, bool, Option<String>, i64);
type Index = (String, bool, Vec<String>, Option<String>);
type ForeignKey = (String, String, Option<String>, String);
type Trigger = (String, Option<String>);

#[derive(Debug, PartialEq)]
pub(super) struct Table {
    pub(super) columns: BTreeSet<Column>,
    pub(super) indexes: BTreeSet<Index>,
    pub(super) foreign_keys: BTreeSet<ForeignKey>,
    pub(super) triggers: BTreeSet<Trigger>,
}

fn strings(conn: &Connection, sql: &str, arg: &str) -> Vec<String> {
    conn.prepare(sql)
        .unwrap()
        .query_map([arg], |r| r.get(0))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap()
}

pub(super) fn describe(conn: &Connection) -> BTreeMap<String, Table> {
    let tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap();
    tables
        .into_iter()
        .map(|name| {
            let table = Table {
                columns: columns(conn, &name),
                indexes: indexes(conn, &name),
                foreign_keys: foreign_keys(conn, &name),
                triggers: triggers(conn, &name),
            };
            (name.to_ascii_lowercase(), table)
        })
        .collect()
}

fn columns(conn: &Connection, table: &str) -> BTreeSet<Column> {
    conn.prepare("SELECT name, type, \"notnull\", dflt_value, pk FROM pragma_table_info(?1)")
        .unwrap()
        .query_map([table], |r| {
            Ok((
                r.get(0)?,
                r.get::<_, String>(1)?.to_ascii_uppercase(),
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
            ))
        })
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap()
}

fn normalized(sql: Option<String>) -> Option<String> {
    sql.map(|sql| sql.split_whitespace().collect::<Vec<_>>().join(" "))
}

fn indexes(conn: &Connection, table: &str) -> BTreeSet<Index> {
    let listed: Vec<(String, bool)> = conn
        .prepare("SELECT name, \"unique\" FROM pragma_index_list(?1) WHERE origin != 'pk'")
        .unwrap()
        .query_map([table], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap();
    listed
        .into_iter()
        .map(|(name, unique)| {
            let keys = strings(
                conn,
                "SELECT COALESCE(name, '<expr>') FROM pragma_index_xinfo(?1) WHERE key = 1 ORDER BY seqno",
                &name,
            );
            let sql = conn
                .query_row("SELECT sql FROM sqlite_schema WHERE name = ?1", [&name], |r| r.get(0))
                .unwrap();
            (name, unique, keys, normalized(sql))
        })
        .collect()
}

fn foreign_keys(conn: &Connection, table: &str) -> BTreeSet<ForeignKey> {
    conn.prepare("SELECT \"from\", \"table\", \"to\", on_delete FROM pragma_foreign_key_list(?1)")
        .unwrap()
        .query_map([table], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
        })
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap()
}

fn triggers(conn: &Connection, table: &str) -> BTreeSet<Trigger> {
    conn.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = ?1")
        .unwrap()
        .query_map([table], |r| Ok((r.get(0)?, normalized(r.get(1)?))))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap()
}
