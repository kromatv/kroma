mod pages;
mod sign_in;
mod survey;
mod unanswered;

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use serde_json::{Value, json};

use super::*;
use crate::domain::import::{RefusalReason, Server};
use crate::point::StubFn;

const IMPORTER: &str = "tv.x.import";

type Sent = Arc<Mutex<Vec<(String, Value)>>>;

fn answering(answer: Value) -> (Importers, Sent) {
    let sent: Sent = Arc::default();
    let seen = sent.clone();
    let stub: StubFn = Arc::new(move |method, body| {
        seen.lock()
            .unwrap()
            .push((method.to_string(), body.clone()));
        Some(answer.clone())
    });
    let importers = Importers::new(Point::stubs(POINT, vec![(IMPORTER, stub)]));
    (importers, sent)
}

fn sent_once(sent: &Sent) -> (String, Value) {
    let calls = sent.lock().unwrap();
    assert_eq!(calls.len(), 1);
    calls[0].clone()
}

fn form(fields: &[(&str, &str)]) -> ConnectAsk {
    ConnectAsk {
        fields: fields
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect(),
        pending: None,
    }
}

fn server() -> SurveyAsk {
    SurveyAsk {
        sign_in: "s-1".into(),
        server: "srv".into(),
    }
}

fn first_page() -> TitlesAsk {
    TitlesAsk {
        sign_in: "s-1".into(),
        server: "srv".into(),
        library: "1".into(),
        cursor: None,
    }
}

fn rows(count: usize) -> Vec<Value> {
    (0..count)
        .map(|n| json!({ "id": format!("t{n}"), "kind": "movie" }))
        .collect()
}
