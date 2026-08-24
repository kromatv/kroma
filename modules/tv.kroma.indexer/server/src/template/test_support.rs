use std::collections::HashMap;

use crate::context::{Context, Value};

pub(super) fn ctx() -> Context {
    let mut config = HashMap::new();
    config.insert("username".into(), Value::Str("alice".into()));
    config.insert("freeleech".into(), Value::Bool(false));
    config.insert("disablesort".into(), Value::Bool(false));
    config.insert("sort".into(), Value::Str("seeders".into()));
    Context {
        keywords: "the matrix 1999".into(),
        categories: vec!["1".into(), "3".into()],
        config,
        ..Default::default()
    }
}

pub(super) fn unchanged(template: &str) {
    assert_eq!(
        super::render(template, &ctx()),
        template,
        "should have come back verbatim"
    );
}
