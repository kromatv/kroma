//! The Cardigann field/keyword filter pipeline.
//!
//! A filter takes the current string value (plus zero or more arguments) and
//! returns a transformed string. Filters chain in declaration order. Arguments
//! may themselves be templates (`append "{{ if .Config.x }}…{{ end }}"`), so
//! they are rendered against the context before the filter runs.
//!
//! The commonly-used filters are implemented faithfully; unknown filters pass
//! the value through unchanged (a definition using one exotic filter still
//! returns usable releases) - see [`apply_one`].

mod date;
mod encoding;
mod text;

use crate::context::Context;
use crate::definition::Filter;
use crate::template;

use date::{date_parse, reltime};
pub(crate) use encoding::url_encode;
use encoding::{html_decode, html_encode, query_param, url_decode};
use text::{regexp_extract, remove_diacritics, split, valid_filename, validate};

/// Run a filter chain over `value`.
pub fn apply(value: &str, filters: &[Filter], ctx: &Context) -> String {
    let mut v = value.to_string();
    for f in filters {
        let args: Vec<String> = f.args.iter().map(|a| template::render(a, ctx)).collect();
        v = apply_one(&f.name, &v, &args);
    }
    v
}

fn apply_one(name: &str, value: &str, args: &[String]) -> String {
    let arg = |i: usize| args.get(i).map(String::as_str).unwrap_or("");
    match name {
        "re_replace" => match regex::Regex::new(arg(0)) {
            Ok(re) => re.replace_all(value, arg(1)).into_owned(),
            Err(_) => value.to_string(),
        },
        "replace" => value.replace(arg(0), arg(1)),
        "trim" => {
            if args.is_empty() {
                value.trim().to_string()
            } else {
                let cut: Vec<char> = arg(0).chars().collect();
                value.trim_matches(|c| cut.contains(&c)).to_string()
            }
        }
        "trimprefix" => value.strip_prefix(arg(0)).unwrap_or(value).to_string(),
        "trimsuffix" => value.strip_suffix(arg(0)).unwrap_or(value).to_string(),
        "prepend" => format!("{}{}", arg(0), value),
        "append" => format!("{}{}", value, arg(0)),
        "tolower" => value.to_lowercase(),
        "toupper" => value.to_uppercase(),
        "split" => split(value, arg(0), arg(1)),
        "regexp" => regexp_extract(value, arg(0)),
        "htmldecode" => html_decode(value),
        "htmlencode" => html_encode(value),
        "urldecode" => url_decode(value),
        "urlencode" => url_encode(value),
        "validate" => validate(value, arg(0)),
        "validfilename" => valid_filename(value),
        "diacritics" => remove_diacritics(value),
        "querystring" => query_param(value, arg(0)),
        "dateparse" | "date" => date_parse(value, args),
        "timeago" | "reltime" | "fuzzytime" | "timeparse" => reltime(value),
        // Debug helpers + not-yet-modeled filters: pass through unchanged.
        "hexdump" | "strdump" | "widthfix" => value.to_string(),
        _ => value.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::definition::Filter;

    pub(super) fn f(name: &str, args: &[&str]) -> Filter {
        Filter {
            name: name.into(),
            args: args.iter().map(|s| s.to_string()).collect(),
        }
    }

    pub(super) fn run(value: &str, filters: &[Filter]) -> String {
        apply(value, filters, &Context::default())
    }

    #[test]
    fn basic_string_filters() {
        assert_eq!(run("Hello", &[f("tolower", &[])]), "hello");
        assert_eq!(run(" x ", &[f("trim", &[])]), "x");
        assert_eq!(run("a-b-c", &[f("replace", &["-", " "])]), "a b c");
        assert_eq!(run("cat=42&x=1", &[f("regexp", &["cat=(\\d+)"])]), "42");
        assert_eq!(run("/a/b/c", &[f("split", &["/", "2"])]), "b");
        assert_eq!(run("/a/b/c", &[f("split", &["/", "-1"])]), "c");
        assert_eq!(
            run(
                "abc",
                &[f("prepend", &["/dl/"]), f("append", &[".torrent"])]
            ),
            "/dl/abc.torrent"
        );
    }

    #[test]
    fn regexp_replace_chain() {
        let out = run("The.Matrix.1999", &[f("re_replace", &["\\.", " "])]);
        assert_eq!(out, "The Matrix 1999");
    }

    #[test]
    fn trim_variants_and_case() {
        // trim with an explicit cut-set trims those chars from both ends.
        assert_eq!(run("**hi**", &[f("trim", &["*"])]), "hi");
        assert_eq!(run("xxabcx", &[f("trim", &["x"])]), "abc");
        assert_eq!(run("/dl/file", &[f("trimprefix", &["/dl/"])]), "file");
        // A prefix/suffix that is not present leaves the value unchanged.
        assert_eq!(run("file", &[f("trimprefix", &["/dl/"])]), "file");
        assert_eq!(
            run("file.torrent", &[f("trimsuffix", &[".torrent"])]),
            "file"
        );
        assert_eq!(run("file", &[f("trimsuffix", &[".torrent"])]), "file");
        assert_eq!(run("abc", &[f("toupper", &[])]), "ABC");
    }

    #[test]
    fn re_replace_invalid_pattern_passes_through() {
        assert_eq!(run("keep me", &[f("re_replace", &["(", "x"])]), "keep me");
    }

    #[test]
    fn unknown_and_debug_filters_pass_value_through() {
        assert_eq!(run("keep", &[f("totally_unknown_filter", &[])]), "keep");
        assert_eq!(run("keep", &[f("hexdump", &[])]), "keep");
        assert_eq!(run("keep", &[f("strdump", &[])]), "keep");
        assert_eq!(run("keep", &[f("widthfix", &[])]), "keep");
    }
}
