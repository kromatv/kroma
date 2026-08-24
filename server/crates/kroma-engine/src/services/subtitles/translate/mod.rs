//! AI subtitle translation: translate a WebVTT track into another language using
//! the app's configured LLM providers in failover order. Timestamps are preserved
//! verbatim; only cue text is translated, in batches.

mod backends;
mod batch;

#[cfg(test)]
mod test_support;
#[cfg(test)]
mod tests;

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use tracing::{info, warn};

use crate::services::settings::Settings;
use crate::services::subtitles::progress::Handle;

use backends::{build_backends, translate_one, Backend};

struct Cue {
    timing: String,
    text: String,
}

fn parse_cues(vtt: &str) -> Vec<Cue> {
    let mut cues = Vec::new();
    let mut timing: Option<String> = None;
    let mut text: Vec<String> = Vec::new();
    let flush = |timing: &mut Option<String>, text: &mut Vec<String>, cues: &mut Vec<Cue>| {
        if let Some(t) = timing.take() {
            cues.push(Cue {
                timing: t,
                text: text.join("\n"),
            });
        }
        text.clear();
    };
    for line in vtt.lines() {
        if line.contains("-->") {
            flush(&mut timing, &mut text, &mut cues);
            timing = Some(line.trim().to_string());
        } else if timing.is_some() {
            if line.trim().is_empty() {
                flush(&mut timing, &mut text, &mut cues);
            } else {
                text.push(line.to_string());
            }
        }
    }
    flush(&mut timing, &mut text, &mut cues);
    cues
}

const BATCH: usize = 24;
const PARALLEL: usize = 4;

/// Translates `vtt` into `target_lang`, batching cue text through the configured
/// LLM providers with failover. `Err` carries why nothing could be translated at
/// all; a partial translation is still `Ok`. Blocking - call off-thread.
pub fn translate_vtt(
    settings: &Settings,
    vtt: &str,
    target_lang: &str,
    handle: &Handle,
) -> std::result::Result<String, String> {
    let backends = build_backends(settings);
    if backends.is_empty() {
        return Err("no LLM provider configured (set one on the admin IA page)".to_string());
    }
    let cues = parse_cues(vtt);
    if cues.is_empty() {
        return Err("the source subtitle had no cues to translate".to_string());
    }
    let total = cues.len();
    let chunks: Vec<&[Cue]> = cues.chunks(BATCH).collect();
    let batches = chunks.len();
    let chain = backends
        .iter()
        .map(|b| b.label.as_str())
        .collect::<Vec<_>>()
        .join(" -> ");
    let workers = PARALLEL.min(batches).max(1);
    info!(target = %target_lang, cues = total, batches, workers, %chain, "subtitle translate: starting");
    handle.progress(0, total);

    let next = AtomicUsize::new(0);
    let active = AtomicUsize::new(0);
    let done = AtomicUsize::new(0);
    let translated = AtomicUsize::new(0);
    let results: Vec<Mutex<Option<Vec<Option<String>>>>> =
        (0..batches).map(|_| Mutex::new(None)).collect();
    let first_error: Mutex<Option<String>> = Mutex::new(None);

    std::thread::scope(|s| {
        for _ in 0..workers {
            s.spawn(|| {
                translate_worker(
                    &next,
                    &active,
                    &done,
                    &translated,
                    &chunks,
                    &backends,
                    &results,
                    &first_error,
                    handle,
                    target_lang,
                    batches,
                    total,
                )
            });
        }
    });

    if handle.cancelled() {
        return Err("cancelled".to_string());
    }
    let ok_batches = translated.load(Ordering::Relaxed);
    if ok_batches == 0 {
        // first_error carries the LLM's actual complaint (auth, credits, parse, ...).
        return Err(first_error
            .into_inner()
            .unwrap()
            .unwrap_or_else(|| "translation failed for every batch".to_string()));
    }
    if ok_batches < batches {
        warn!(
            ok = ok_batches,
            total = batches,
            "subtitle translate: finished with some batches left untranslated"
        );
    } else {
        info!(batches, "subtitle translate: done");
    }

    Ok(reassemble_vtt(&chunks, &results))
}

#[allow(clippy::too_many_arguments)]
fn translate_worker(
    next: &AtomicUsize,
    active: &AtomicUsize,
    done: &AtomicUsize,
    translated: &AtomicUsize,
    chunks: &[&[Cue]],
    backends: &[Backend],
    results: &[Mutex<Option<Vec<Option<String>>>>],
    first_error: &Mutex<Option<String>>,
    handle: &Handle,
    target_lang: &str,
    batches: usize,
    total: usize,
) {
    loop {
        if handle.cancelled() {
            break;
        }
        let bi = next.fetch_add(1, Ordering::Relaxed);
        if bi >= batches {
            break;
        }
        let batch = chunks[bi];
        match translate_one(backends, active, batch, target_lang) {
            Ok(v) => {
                *results[bi].lock().unwrap() = Some(v);
                translated.fetch_add(1, Ordering::Relaxed);
            }
            Err(e) => {
                warn!(
                    batch = bi + 1,
                    total = batches,
                    "subtitle translate: batch failed on every provider: {e}"
                );
                let mut fe = first_error.lock().unwrap();
                if fe.is_none() {
                    *fe = Some(e);
                }
            }
        }
        let d = done.fetch_add(batch.len(), Ordering::Relaxed) + batch.len();
        handle.progress(d, total);
    }
}

fn reassemble_vtt(chunks: &[&[Cue]], results: &[Mutex<Option<Vec<Option<String>>>>]) -> String {
    let mut out = String::from("WEBVTT\n\n");
    for (bi, batch) in chunks.iter().enumerate() {
        let res = results[bi].lock().unwrap();
        for (i, cue) in batch.iter().enumerate() {
            let line = res
                .as_ref()
                .and_then(|v| v.get(i))
                .and_then(Option::as_deref)
                .filter(|s| !s.is_empty())
                .unwrap_or(&cue.text);
            out.push_str(&cue.timing);
            out.push('\n');
            out.push_str(line.trim());
            out.push_str("\n\n");
        }
    }
    out
}
