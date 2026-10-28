//! What the shell has told the page about its native engine. The page reads
//! these as globals, and a reload wipes globals, so each one is said again
//! whenever a page finishes loading.

use std::sync::Mutex;

use tauri::webview::{PageLoadEvent, PageLoadPayload};
use tauri::{Runtime, Webview, WebviewWindow};

static SAID: Mutex<Vec<&'static str>> = Mutex::new(Vec::new());

/// Tells the page `script` now and on every later page load.
pub fn announce<R: Runtime>(win: &WebviewWindow<R>, script: &'static str) {
    SAID.lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .push(script);
    let _ = win.eval(script);
}

/// The `on_page_load` hook: repeats everything announced so far.
pub fn on_page_load<R: Runtime>(webview: &Webview<R>, payload: &PageLoadPayload<'_>) {
    if payload.event() != PageLoadEvent::Finished {
        return;
    }
    let said = SAID.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    for script in said.iter() {
        let _ = webview.eval(*script);
    }
}
