use std::time::Instant;

use tracing::span::{Attributes, Id};
use tracing::Subscriber;
use tracing_subscriber::filter::{filter_fn, Filtered};
use tracing_subscriber::layer::{Context, Layer};
use tracing_subscriber::registry::LookupSpan;

use crate::profiler::profiler;

struct Opened(Instant);

/// Times every span from the targets it is given, from creation to close, as a
/// segment of kind `span` named `target::name` with its `file:line`. So
/// `#[tracing::instrument(level = "trace", skip_all)]` on a function is all it
/// takes to see its calls in the reports. It carries its own filter: the spans
/// it times reach no log.
pub fn span_layer<S>(targets: &'static [&'static str]) -> impl Layer<S>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    let wanted = filter_fn(move |meta| {
        meta.is_span() && targets.iter().any(|t| meta.target().starts_with(t))
    });
    let timed: Filtered<SpanTimer, _, S> = SpanTimer.with_filter(wanted);
    timed
}

struct SpanTimer;

impl<S> Layer<S> for SpanTimer
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    fn on_new_span(&self, _attrs: &Attributes<'_>, id: &Id, ctx: Context<'_, S>) {
        if !profiler().enabled() {
            return;
        }
        if let Some(span) = ctx.span(id) {
            span.extensions_mut().insert(Opened(Instant::now()));
        }
    }

    fn on_close(&self, id: Id, ctx: Context<'_, S>) {
        let Some(span) = ctx.span(&id) else {
            return;
        };
        let Some(elapsed) = span.extensions().get::<Opened>().map(|o| o.0.elapsed()) else {
            return;
        };
        let meta = span.metadata();
        let label = format!("{}::{}", meta.target(), meta.name());
        let origin = meta
            .file()
            .zip(meta.line())
            .map(|(file, line)| format!("{file}:{line}"));
        profiler().record("span", &label, origin.as_deref(), elapsed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profiler::Window;
    use tracing_subscriber::layer::SubscriberExt;

    #[tracing::instrument(level = "trace", skip_all)]
    fn instrumented_for_the_span_layer_test() -> u32 {
        7
    }

    #[test]
    fn an_instrumented_function_is_timed_under_its_name_and_place() {
        let subscriber = tracing_subscriber::registry().with(span_layer(&["kroma_perf"]));

        tracing::subscriber::with_default(subscriber, instrumented_for_the_span_layer_test);

        let label = "kroma_perf::span_layer::tests::instrumented_for_the_span_layer_test";
        let (key, descriptor) = profiler()
            .catalog
            .all()
            .into_iter()
            .find(|(_, d)| d.label == label)
            .expect("the span was recorded");
        assert!(descriptor.origin.unwrap().contains("span_layer.rs:"));
        assert_eq!(
            profiler().window(Window::Hour).segments[&key].timing.count,
            1
        );
    }

    #[test]
    fn a_span_from_another_target_is_left_alone() {
        let subscriber = tracing_subscriber::registry().with(span_layer(&["somewhere_else"]));

        tracing::subscriber::with_default(subscriber, || {
            tracing::trace_span!("ignored_by_the_layer").in_scope(|| ())
        });

        assert!(profiler()
            .catalog
            .all()
            .iter()
            .all(|(_, d)| !d.label.ends_with("ignored_by_the_layer")));
    }
}
