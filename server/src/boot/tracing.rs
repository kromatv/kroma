//! Log wiring: stdout, a rolling daily file, and the in-memory ring the admin
//! console reads.

use kroma_engine::infra;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

/// What a server with no `RUST_LOG` says about itself.
///
/// The bare `warn` matters more than any entry after it. An `EnvFilter` built
/// only from `target=level` directives drops every target that matches none of
/// them, so anything not named here was silent in production, at every level:
/// a NAS ran for six weeks without one line explaining which encoder it had
/// settled on or why a remux refused to start, because `kroma_engine` was not
/// on the list. A floor of `warn` means a problem is never silent again, and
/// the entries above it are the subsystems whose ordinary progress an operator
/// reads rather than debugs.
///
/// Every developer runs with `RUST_LOG` set, which replaces this wholesale.
/// That is why nobody saw it.
const DEFAULT_FILTER: &str = "warn,\
    kroma_server=info,\
    kroma_engine=info,\
    kroma_module_supervisor=info,\
    tower_http=info,axum=info,librqbit=info";

/// Days of rolling log kept on disk. `tracing_appender` deletes nothing on its
/// own, so before this was set a NAS accumulated one file per day forever. Long
/// enough to still hold the week a viewer eventually gets round to reporting.
const KEEP_DAYS: usize = 30;

pub fn init_tracing(
    log_dir: &std::path::Path,
) -> Option<tracing_appender::non_blocking::WorkerGuard> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(DEFAULT_FILTER));

    let (file_layer, guard) = match std::fs::create_dir_all(log_dir) {
        Ok(()) => {
            let appender = tracing_appender::rolling::Builder::new()
                .rotation(tracing_appender::rolling::Rotation::DAILY)
                .filename_prefix("kroma.log")
                .max_log_files(KEEP_DAYS)
                .build(log_dir)
                .unwrap_or_else(|_| tracing_appender::rolling::daily(log_dir, "kroma.log"));
            let (writer, guard) = tracing_appender::non_blocking(appender);
            let layer = tracing_subscriber::fmt::layer()
                .with_ansi(false)
                .with_writer(writer);
            (Some(layer), Some(guard))
        }
        Err(e) => {
            // Tracing isn't initialised yet, so report to stderr directly.
            eprintln!(
                "warning: could not create log dir {} ({e}); file logging disabled",
                log_dir.display()
            );
            (None, None)
        }
    };

    tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer())
        .with(file_layer)
        .with(LogBufferLayer)
        .init();

    guard
}

struct LogBufferLayer;

impl<S: tracing::Subscriber> tracing_subscriber::Layer<S> for LogBufferLayer {
    fn on_event(
        &self,
        event: &tracing::Event<'_>,
        _ctx: tracing_subscriber::layer::Context<'_, S>,
    ) {
        struct Fields {
            message: String,
            extra: String,
        }
        impl tracing::field::Visit for Fields {
            fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
                use std::fmt::Write;
                if field.name() == "message" {
                    let _ = write!(self.message, "{value:?}");
                } else {
                    let sep = if self.extra.is_empty() { "" } else { " " };
                    let _ = write!(self.extra, "{sep}{}={:?}", field.name(), value);
                }
            }
        }
        let mut fields = Fields {
            message: String::new(),
            extra: String::new(),
        };
        event.record(&mut fields);
        if !fields.extra.is_empty() {
            if !fields.message.is_empty() {
                fields.message.push(' ');
            }
            fields.message.push_str(&fields.extra);
        }
        let meta = event.metadata();
        infra::logbuf::LOG_BUFFER.push_core(meta.level().as_str(), meta.target(), fields.message);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tracing_subscriber::layer::SubscriberExt;

    // A scoped subscriber carrying only the layer under test, so the assertions
    // are about what IT recorded rather than about whatever the process global
    // happens to be.
    fn with_layer(emit: impl FnOnce()) {
        let subscriber = tracing_subscriber::registry().with(LogBufferLayer);
        tracing::subscriber::with_default(subscriber, emit);
    }

    fn latest(q: &str) -> Option<infra::logbuf::LogEntry> {
        infra::logbuf::LOG_BUFFER
            .snapshot(200, None, Some("core"), Some(q))
            .pop()
    }

    // Emitted through the real filter, so what is asserted is what a server with
    // no RUST_LOG would actually have written.
    fn under_default_filter(emit: impl FnOnce()) {
        let subscriber = tracing_subscriber::registry()
            .with(EnvFilter::new(DEFAULT_FILTER))
            .with(LogBufferLayer);
        tracing::subscriber::with_default(subscriber, emit);
    }

    // The bug this pins: the default filter named only two of our crates, so a
    // production server dropped every line the engine emitted, warnings and
    // errors included, and a NAS ran for six weeks with nothing to read.
    #[test]
    fn the_engine_narrates_itself_in_production() {
        under_default_filter(|| {
            tracing::info!(
                target: "kroma_engine::infra::hls::session",
                "boot-tracing-engine-marker"
            );
        });

        assert!(latest("boot-tracing-engine-marker").is_some());
    }

    #[test]
    fn a_crate_nobody_listed_still_gets_to_report_a_problem() {
        under_default_filter(|| {
            tracing::warn!(target: "some_dependency", "boot-tracing-stranger-warn");
            tracing::info!(target: "some_dependency", "boot-tracing-stranger-info");
        });

        assert!(latest("boot-tracing-stranger-warn").is_some());
        assert!(
            latest("boot-tracing-stranger-info").is_none(),
            "without buying its ordinary chatter"
        );
    }

    #[test]
    fn a_message_reaches_the_console_ring_with_its_level_and_target() {
        with_layer(|| tracing::warn!("boot-tracing-plain-marker"));
        let entry = latest("boot-tracing-plain-marker").expect("the line was buffered");
        assert_eq!(
            entry.level, "warn",
            "lowercased, the vocabulary the console filters on"
        );
        assert_eq!(entry.target, module_path!());
        assert_eq!(entry.source, "core");
        assert_eq!(entry.message, "boot-tracing-plain-marker");
    }

    #[test]
    fn structured_fields_are_appended_to_the_message_the_console_shows() {
        // The ring holds one string per line, so a field that only existed as
        // structured data would vanish from the admin console entirely.
        with_layer(|| {
            tracing::info!(
                module = "tv.kroma.acq",
                port = 42,
                "boot-tracing-fields-marker"
            )
        });
        let entry = latest("boot-tracing-fields-marker").expect("buffered");
        assert!(
            entry.message.starts_with("boot-tracing-fields-marker "),
            "{}",
            entry.message
        );
        assert!(
            entry.message.contains("module=\"tv.kroma.acq\""),
            "{}",
            entry.message
        );
        assert!(entry.message.contains("port=42"), "{}", entry.message);
    }

    #[test]
    fn a_line_that_is_only_fields_still_says_something() {
        with_layer(|| tracing::error!(reason = "boot-tracing-fieldsonly-marker"));
        let entry = latest("boot-tracing-fieldsonly-marker").expect("buffered");
        assert_eq!(entry.level, "error");
        // No leading space: there was no message to separate the fields from.
        assert_eq!(entry.message, "reason=\"boot-tracing-fieldsonly-marker\"");
    }
}
