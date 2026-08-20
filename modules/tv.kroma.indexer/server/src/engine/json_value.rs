// Resolves a dotted JSON path (`$.a.b`, `a`, `a[0].b`) against a value.
pub(super) fn json_get<'a>(value: &'a serde_json::Value, path: &str) -> Option<&'a serde_json::Value> {
    let path = path.trim().trim_start_matches('$').trim_start_matches('.');
    if path.is_empty() {
        return Some(value);
    }
    let mut cur = value;
    for seg in path.split('.') {
        // Split `key[idx]` into a key then any number of array indices.
        let (key, rest) = match seg.find('[') {
            Some(i) => (&seg[..i], &seg[i..]),
            None => (seg, ""),
        };
        if !key.is_empty() {
            cur = cur.get(key)?;
        }
        let mut r = rest;
        while let Some(inner) = r.strip_prefix('[') {
            let close = inner.find(']')?;
            let idx: usize = inner[..close].parse().ok()?;
            cur = cur.get(idx)?;
            r = &inner[close + 1..];
        }
        if !r.is_empty() {
            return None;
        }
    }
    Some(cur)
}

pub(super) fn json_scalar_string(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Null => String::new(),
        other => other.to_string(),
    }
}

pub(super) fn json_truthy(v: &serde_json::Value) -> bool {
    match v {
        serde_json::Value::Null => false,
        serde_json::Value::Bool(b) => *b,
        serde_json::Value::String(s) => !s.is_empty(),
        serde_json::Value::Number(n) => n.as_f64() != Some(0.0),
        serde_json::Value::Array(a) => !a.is_empty(),
        serde_json::Value::Object(o) => !o.is_empty(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_get_resolves_paths() {
        let v: serde_json::Value =
            serde_json::from_str(r#"{"a":{"b":[10,20,{"c":"deep"}]}}"#).unwrap();
        assert_eq!(json_get(&v, "$.a.b[0]").unwrap().as_i64(), Some(10));
        assert_eq!(json_get(&v, "a.b[1]").unwrap().as_i64(), Some(20));
        assert_eq!(json_get(&v, "a.b[2].c").unwrap().as_str(), Some("deep"));
        assert!(json_get(&v, "a.x").is_none());
        assert!(json_get(&v, "a.b[9]").is_none());
        // Empty / bare-$ path resolves to the whole value.
        assert!(std::ptr::eq(json_get(&v, "").unwrap(), &v));
        assert!(std::ptr::eq(json_get(&v, "$").unwrap(), &v));
    }

    #[test]
    fn json_scalar_string_and_truthy() {
        use serde_json::json;
        assert_eq!(json_scalar_string(&json!("hi")), "hi");
        assert_eq!(json_scalar_string(&json!(42)), "42");
        assert_eq!(json_scalar_string(&json!(true)), "true");
        assert_eq!(json_scalar_string(&serde_json::Value::Null), "");
        assert_eq!(json_scalar_string(&json!([1, 2])), "[1,2]");

        assert!(!json_truthy(&serde_json::Value::Null));
        assert!(json_truthy(&json!(true)) && !json_truthy(&json!(false)));
        assert!(json_truthy(&json!("x")) && !json_truthy(&json!("")));
        assert!(json_truthy(&json!(5)) && !json_truthy(&json!(0)));
        assert!(json_truthy(&json!([1])) && !json_truthy(&json!([])));
        assert!(json_truthy(&json!({"a":1})) && !json_truthy(&json!({})));
    }


    #[test]
    fn json_get_resolves_a_bare_index_segment() {
        let v: serde_json::Value = serde_json::from_str(r#"{"a":{"b":[10,20,{"c":"deep"}]}}"#).unwrap();
        assert_eq!(json_get(&v, "a.b.[1]").unwrap().as_i64(), Some(20));
        assert_eq!(json_get(&v, "a.b.[2].c").unwrap().as_str(), Some("deep"));
        assert!(json_get(&v, "a.b.[9]").is_none());
        assert!(json_get(&v, "a.b[x]").is_none());
    }

    #[test]
    fn json_get_rejects_a_malformed_index_segment_without_panicking() {
        let v: serde_json::Value = serde_json::from_str(r#"{"a":{"b":[10,20]}}"#).unwrap();
        assert!(json_get(&v, "a.b[0]]").is_none());
        assert!(json_get(&v, "a.b[0").is_none());
        assert!(json_get(&v, "a.b]").is_none());
    }

}
