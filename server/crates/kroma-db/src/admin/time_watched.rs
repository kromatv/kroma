//! The time one row of the play log counts for. A play an import brought with
//! no duration counts for the runtime of its title.
//!
//! Both read a row of `play_history h` with its title joined as `items i`.

macro_rules! runtime_stands_in {
    () => {
        "(h.import_server_id IS NOT NULL AND h.watched_ms = 0)"
    };
}

/// True for a row whose time is the runtime of its title.
pub(super) const RUNTIME_STANDS_IN: &str = runtime_stands_in!();

/// The milliseconds a row counts for. The runtime is the one the catalogue
/// holds when the log is read, and nothing while it holds none.
pub(super) const TIME_WATCHED: &str = concat!(
    "CASE WHEN ",
    runtime_stands_in!(),
    " THEN COALESCE(i.duration_ms, 0) ELSE h.watched_ms END"
);
