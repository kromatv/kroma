use std::cell::RefCell;
use std::collections::HashMap;
use std::ffi::{c_char, c_int, c_uint, c_void, CStr};
use std::panic::catch_unwind;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex, Once, OnceLock};
use std::time::Instant;

use rusqlite::ffi;
use twox_hash::XxHash3_128;

use crate::profiler::profiler;
use crate::segment::{Counters, Segment};
use crate::sql_text::normalize;

const OPEN_STATEMENTS_KEPT: usize = 64;
const TRACED: c_uint = ffi::SQLITE_TRACE_STMT
    | ffi::SQLITE_TRACE_PROFILE
    | ffi::SQLITE_TRACE_ROW
    | ffi::SQLITE_TRACE_CLOSE;

/// Names a database file for the reports, or `None` to leave it untraced.
pub type DatabaseNamer = fn(&Path) -> Option<String>;

static INSTALL: Once = Once::new();
static NAMER: OnceLock<DatabaseNamer> = OnceLock::new();
static IGNORED: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());
static KEYS: LazyLock<Mutex<HashMap<u128, u64>>> = LazyLock::new(Mutex::default);

thread_local! {
    static OPEN: RefCell<Vec<Running>> = const { RefCell::new(Vec::new()) };
}

struct Running {
    statement: usize,
    started: Instant,
    rows: u64,
}

struct Traced {
    origin: String,
}

/// Makes every SQLite connection the process opens from now on report each
/// statement it runs: its time, the rows it returned, and SQLite's own count
/// of full-scan steps, sorts and automatic indexes. Connections already open
/// are not traced. Idempotent.
pub fn install() {
    INSTALL.call_once(|| {
        // SAFETY: `on_open` has the signature SQLite expects of an automatic
        // extension and never opens a database itself.
        let registered = unsafe { ffi::sqlite3_auto_extension(Some(on_open)) };
        if registered != ffi::SQLITE_OK {
            tracing::warn!(code = registered, "statement profiling did not install");
        }
    });
}

/// Sets how database files are named in reports. The first call wins; without
/// one a database is named after its file.
pub fn name_databases(namer: DatabaseNamer) {
    let _ = NAMER.set(namer);
}

pub(crate) fn ignore_database(path: &Path) {
    IGNORED.lock().unwrap().push(resolved(path));
}

fn resolved(path: &Path) -> PathBuf {
    let parent = path.parent().and_then(|dir| dir.canonicalize().ok());
    match (parent, path.file_name()) {
        (Some(dir), Some(name)) => dir.join(name),
        _ => path.to_path_buf(),
    }
}

fn origin_of(path: &Path) -> Option<String> {
    let path = resolved(path);
    if IGNORED.lock().unwrap().contains(&path) {
        return None;
    }
    match NAMER.get() {
        Some(namer) => namer(&path),
        None => Some(default_name(&path)),
    }
}

fn default_name(path: &Path) -> String {
    path.file_stem().map_or_else(
        || "memory".to_string(),
        |stem| stem.to_string_lossy().into_owned(),
    )
}

unsafe extern "C" fn on_open(
    db: *mut ffi::sqlite3,
    _: *mut *mut c_char,
    _: *const ffi::sqlite3_api_routines,
) -> c_int {
    let Ok(Some(origin)) = catch_unwind(|| origin_of(&database_path(db))) else {
        return ffi::SQLITE_OK;
    };
    let context = Box::into_raw(Box::new(Traced { origin })).cast::<c_void>();
    // SAFETY: `db` is the connection SQLite is opening. `context` stays alive
    // until the close event, which frees it.
    unsafe { ffi::sqlite3_trace_v2(db, TRACED, Some(on_trace), context) };
    ffi::SQLITE_OK
}

fn database_path(db: *mut ffi::sqlite3) -> PathBuf {
    // SAFETY: `db` is a live connection and "main" always names a schema of it.
    let name = unsafe { ffi::sqlite3_db_filename(db, c"main".as_ptr()) };
    if name.is_null() {
        return PathBuf::new();
    }
    // SAFETY: SQLite returns a NUL-terminated path that lives as long as `db`.
    PathBuf::from(
        unsafe { CStr::from_ptr(name) }
            .to_string_lossy()
            .into_owned(),
    )
}

unsafe extern "C" fn on_trace(
    event: c_uint,
    context: *mut c_void,
    p: *mut c_void,
    x: *mut c_void,
) -> c_int {
    if event == ffi::SQLITE_TRACE_CLOSE {
        // SAFETY: `context` is the box `on_open` leaked for this connection and
        // nothing reads it after its close event.
        drop(unsafe { Box::from_raw(context.cast::<Traced>()) });
        return 0;
    }
    if !profiler().enabled() {
        return 0;
    }
    let statement = p as usize;
    let _ = catch_unwind(|| match event {
        ffi::SQLITE_TRACE_STMT if !is_trigger(x) => started(statement),
        ffi::SQLITE_TRACE_ROW => counted_row(statement),
        // SAFETY: on a profile event `p` is the statement and `context` the
        // live box `on_open` gave this connection.
        ffi::SQLITE_TRACE_PROFILE => unsafe { finished(p.cast(), &*context.cast::<Traced>(), x) },
        _ => {}
    });
    0
}

fn is_trigger(x: *mut c_void) -> bool {
    // SAFETY: on a statement event `x` is the statement's NUL-terminated text.
    !x.is_null()
        && unsafe { CStr::from_ptr(x.cast::<c_char>()) }
            .to_bytes()
            .starts_with(b"--")
}

fn started(statement: usize) {
    OPEN.with(|open| {
        let mut open = open.borrow_mut();
        if open.len() == OPEN_STATEMENTS_KEPT {
            open.remove(0);
        }
        open.push(Running {
            statement,
            started: Instant::now(),
            rows: 0,
        });
    });
}

fn counted_row(statement: usize) {
    OPEN.with(|open| {
        if let Some(running) = open
            .borrow_mut()
            .iter_mut()
            .rev()
            .find(|r| r.statement == statement)
        {
            running.rows += 1;
        }
    });
}

fn take(statement: usize) -> Option<Running> {
    OPEN.with(|open| {
        let mut open = open.borrow_mut();
        let at = open.iter().rposition(|r| r.statement == statement)?;
        Some(open.remove(at))
    })
}

unsafe fn finished(statement: *mut ffi::sqlite3_stmt, traced: &Traced, x: *mut c_void) {
    let running = take(statement as usize);
    // SAFETY: on a profile event `x` points at SQLite's own elapsed nanoseconds.
    let sqlite_ns = unsafe { *x.cast::<i64>() }.max(0) as u64;
    let elapsed_ns = running
        .as_ref()
        .map_or(sqlite_ns, |r| r.started.elapsed().as_nanos() as u64);
    // SAFETY: `statement` is the statement the event is about, alive for it.
    let (sql, mut counters) = unsafe { (statement_text(statement), status_of(statement)) };
    counters.rows = running.map_or(0, |r| r.rows);
    let key = key_of(sql, &traced.origin);
    profiler().add(Segment {
        kind: "sql",
        key,
        elapsed_ns,
        counters,
        nested: false,
    });
}

unsafe fn statement_text<'a>(statement: *mut ffi::sqlite3_stmt) -> &'a [u8] {
    // SAFETY: the caller's statement is alive; its text lives as long as it.
    let text = unsafe { ffi::sqlite3_sql(statement) };
    if text.is_null() {
        return b"";
    }
    // SAFETY: SQLite returns its NUL-terminated prepared text.
    unsafe { CStr::from_ptr(text) }.to_bytes()
}

unsafe fn status_of(statement: *mut ffi::sqlite3_stmt) -> Counters {
    // SAFETY: the caller's statement is alive; reading a counter with reset set
    // only zeroes it for this statement's next run.
    let read = |op| unsafe { ffi::sqlite3_stmt_status(statement, op, 1) }.max(0) as u64;
    Counters {
        rows: 0,
        full_scan_steps: read(ffi::SQLITE_STMTSTATUS_FULLSCAN_STEP),
        sorts: read(ffi::SQLITE_STMTSTATUS_SORT),
        auto_indexes: read(ffi::SQLITE_STMTSTATUS_AUTOINDEX),
    }
}

fn key_of(sql: &[u8], origin: &str) -> u64 {
    let mut identity = Vec::with_capacity(sql.len() + origin.len() + 1);
    identity.extend_from_slice(origin.as_bytes());
    identity.push(0);
    identity.extend_from_slice(sql);
    let raw = XxHash3_128::oneshot(&identity);
    if let Some(key) = KEYS.lock().unwrap().get(&raw) {
        return *key;
    }
    let label = normalize(&String::from_utf8_lossy(sql));
    let key = profiler().catalog.key_for("sql", &label, Some(origin));
    KEYS.lock().unwrap().insert(raw, key);
    key
}

#[cfg(test)]
mod tests;
