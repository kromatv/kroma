use serde::Deserialize;

/// Any YAML scalar, always read as a string.
#[derive(Debug, Clone, Default)]
pub struct ScalarString(pub String);

impl<'de> Deserialize<'de> for ScalarString {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        Ok(ScalarString(scalar_to_string(
            serde_yaml::Value::deserialize(d)?,
        )))
    }
}

impl std::ops::Deref for ScalarString {
    type Target = str;
    fn deref(&self) -> &str {
        &self.0
    }
}

pub(super) fn scalar_to_string(v: serde_yaml::Value) -> String {
    match v {
        serde_yaml::Value::String(s) => s,
        serde_yaml::Value::Bool(b) => b.to_string(),
        serde_yaml::Value::Number(n) => n.to_string(),
        serde_yaml::Value::Null => String::new(),
        // Stringify a sequence/mapping rather than fail the whole definition.
        other => serde_yaml::to_string(&other)
            .unwrap_or_default()
            .trim()
            .to_string(),
    }
}

pub(super) fn de_scalar_string<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    Ok(scalar_to_string(serde_yaml::Value::deserialize(d)?))
}

pub(super) fn de_opt_scalar_string<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<Option<String>, D::Error> {
    let v = serde_yaml::Value::deserialize(d)?;
    Ok(match v {
        serde_yaml::Value::Null => None,
        other => Some(scalar_to_string(other)),
    })
}

pub(super) fn de_string_or_seq<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<Vec<String>, D::Error> {
    let v = serde_yaml::Value::deserialize(d)?;
    Ok(match v {
        serde_yaml::Value::Null => Vec::new(),
        serde_yaml::Value::Sequence(seq) => seq.into_iter().map(scalar_to_string).collect(),
        other => vec![scalar_to_string(other)],
    })
}

pub(super) fn de_filter_args<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<Vec<String>, D::Error> {
    de_string_or_seq(d)
}

#[cfg(test)]
mod tests {
    use crate::definition::test_support::{parse_ok, MINIMAL};
    use crate::definition::*;

    #[test]
    fn a_key_written_with_no_value_at_all_normalizes_to_empty() {
        let d = parse_ok(
            "\
id: demo
name: Demo
caps:
  categorymappings:
    - {id: , cat: Movies/HD}
login:
  method: post
  cookies:
  inputs:
    username:
search:
  rows: {}
  inputs:
    q:
",
        );
        assert_eq!(d.caps.categorymappings[0].id, "");
        let login = d.login.expect("login block");
        assert!(login.cookies.is_empty());
        assert_eq!(&*login.inputs["username"], "");
        assert_eq!(&*d.search.inputs["q"], "");
    }

    #[test]
    fn a_setting_default_normalizes_every_scalar_shape_to_a_string() {
        let d = parse_ok(
            "\
id: demo
name: Demo
caps: {}
settings:
  - {name: username, type: text, label: Username}
  - {name: freeleech, type: checkbox, default: false}
  - {name: pagesize, type: select, default: 50, options: {50: fifty, 100: hundred}}
  - {name: ratio, type: text, default: 1.5}
  - {name: note, type: info, default: null}
search:
  rows: {}
",
        );
        let by_name = |n: &str| d.settings.iter().find(|s| s.name == n).unwrap().clone();
        assert_eq!(
            by_name("username").default,
            None,
            "an absent default stays absent"
        );
        assert_eq!(by_name("username").label.as_deref(), Some("Username"));
        assert_eq!(by_name("freeleech").default.as_deref(), Some("false"));
        assert_eq!(by_name("pagesize").default.as_deref(), Some("50"));
        assert_eq!(by_name("ratio").default.as_deref(), Some("1.5"));
        assert_eq!(by_name("note").default, None);
        // The option *key* is what `.Config.pagesize` yields, so it must survive
        // as written even though YAML would read it as an int.
        let options = by_name("pagesize").options;
        assert_eq!(options.keys().collect::<Vec<_>>(), ["50", "100"]);
        assert_eq!(options["50"], "fifty");
    }

    #[test]
    fn cookies_accept_a_single_string_or_a_list() {
        let one = parse_ok(&format!(
            "{MINIMAL}login:\n  method: cookie\n  cookies: uid=1; pass=2\n"
        ));
        assert_eq!(one.login.unwrap().cookies, ["uid=1; pass=2"]);

        let many = parse_ok(&format!(
            "{MINIMAL}login:\n  method: cookie\n  cookies: [uid=1, pass=2]\n"
        ));
        assert_eq!(many.login.unwrap().cookies, ["uid=1", "pass=2"]);

        let none = parse_ok(&format!("{MINIMAL}login:\n  method: form\n"));
        assert!(none.login.unwrap().cookies.is_empty());
    }

    #[test]
    fn filter_args_accept_a_scalar_a_list_or_nothing() {
        let d = parse_ok(
            "\
id: demo
name: Demo
caps: {}
search:
  keywordsfilters:
    - {name: re_replace, args: [\"[^a-z]\", \" \"]}
    - {name: trim, args: \"-\"}
    - {name: diacritics}
    - {name: replace, args: 2020}
  rows: {}
",
        );
        let filters = &d.search.keywordsfilters;
        assert_eq!(filters[0].name, "re_replace");
        assert_eq!(filters[0].args, ["[^a-z]", " "]);
        assert_eq!(
            filters[1].args,
            ["-"],
            "a scalar arg becomes a one-element list"
        );
        assert!(filters[2].args.is_empty(), "an absent args is not an error");
        assert_eq!(
            filters[3].args,
            ["2020"],
            "and a numeric arg is stringified"
        );
    }

    #[test]
    fn a_non_scalar_where_a_scalar_belongs_is_stringified_rather_than_fatal() {
        // Deliberate leniency: one malformed input must not cost the whole
        // definition, since the value is only ever templated in as text.
        let d = parse_ok(&format!(
            "{MINIMAL}\
search2: ignored
"
        ));
        assert_eq!(d.id, "demo");

        let odd = parse_ok(
            "\
id: demo
name: Demo
caps: {}
search:
  inputs:
    q: [alpha, beta]
  rows: {}
",
        );
        let q = &*odd.search.inputs["q"];
        assert!(q.contains("alpha") && q.contains("beta"), "{q}");
    }

    #[test]
    fn scalar_string_reads_as_a_str_and_defaults_to_empty() {
        let s = ScalarString("value".into());
        assert_eq!(&*s, "value");
        assert!(s.starts_with("val"), "Deref gives the whole &str API");
        assert_eq!(&*ScalarString::default(), "");
    }
}
