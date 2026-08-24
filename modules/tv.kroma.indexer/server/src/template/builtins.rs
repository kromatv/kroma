use crate::context::Value;

pub(super) fn is_function(name: &str) -> bool {
    matches!(
        name,
        "join"
            | "re_replace"
            | "replace"
            | "and"
            | "or"
            | "not"
            | "eq"
            | "ne"
            | "lt"
            | "le"
            | "gt"
            | "ge"
            | "printf"
    )
}

pub(super) fn call_function(name: &str, args: &[Value]) -> Value {
    let s = |i: usize| args.get(i).map(Value::render).unwrap_or_default();
    match name {
        "join" => {
            let sep = s(1);
            match args.first() {
                Some(Value::List(l)) => Value::Str(l.join(&sep)),
                Some(v) => Value::Str(v.render()),
                None => Value::Str(String::new()),
            }
        }
        "re_replace" => {
            let input = s(0);
            let pattern = s(1);
            let repl = s(2);
            match regex::Regex::new(&pattern) {
                Ok(re) => Value::Str(re.replace_all(&input, repl.as_str()).into_owned()),
                Err(_) => Value::Str(input),
            }
        }
        "replace" => Value::Str(s(0).replace(&s(1), &s(2))),
        "not" => Value::Bool(!args.first().map(Value::truthy).unwrap_or(false)),
        "and" => go_and(args),
        "or" => go_or(args),
        "eq" => Value::Bool(values_eq(args.first(), args.get(1))),
        "ne" => Value::Bool(!values_eq(args.first(), args.get(1))),
        "lt" | "le" | "gt" | "ge" => Value::Bool(compare(name, args.first(), args.get(1))),
        "printf" => {
            // Guard the slice: `{{ printf }}` with no args must not panic.
            let rest = if args.len() > 1 { &args[1..] } else { &[][..] };
            Value::Str(sprintf(&s(0), rest))
        }
        _ => Value::Nil,
    }
}

// Go `and`: the first falsy argument, else the last argument.
fn go_and(args: &[Value]) -> Value {
    for a in args {
        if !a.truthy() {
            return a.clone();
        }
    }
    args.last().cloned().unwrap_or(Value::Bool(true))
}

// Go `or`: the first truthy argument, else the last argument.
fn go_or(args: &[Value]) -> Value {
    for a in args {
        if a.truthy() {
            return a.clone();
        }
    }
    args.last().cloned().unwrap_or(Value::Bool(false))
}

fn values_eq(a: Option<&Value>, b: Option<&Value>) -> bool {
    match (a, b) {
        (Some(Value::Bool(x)), Some(Value::Bool(y))) => x == y,
        (Some(x), Some(y)) => x.render() == y.render(),
        _ => false,
    }
}

fn compare(op: &str, a: Option<&Value>, b: Option<&Value>) -> bool {
    let (a, b) = match (a, b) {
        (Some(a), Some(b)) => (a.render(), b.render()),
        _ => return false,
    };
    // Numeric when both parse; lexicographic otherwise.
    let ord = match (a.parse::<f64>(), b.parse::<f64>()) {
        (Ok(x), Ok(y)) => x.partial_cmp(&y),
        _ => Some(a.cmp(&b)),
    };
    match ord {
        Some(o) => match op {
            "lt" => o.is_lt(),
            "le" => o.is_le(),
            "gt" => o.is_gt(),
            "ge" => o.is_ge(),
            _ => false,
        },
        None => false,
    }
}

// Minimal `printf`: supports `%s`, `%d`, `%v`, and zero-padded `%0Nd`.
fn sprintf(format: &str, args: &[Value]) -> String {
    let mut out = String::new();
    let mut chars = format.chars().peekable();
    let mut arg_i = 0;
    while let Some(c) = chars.next() {
        if c != '%' {
            out.push(c);
            continue;
        }
        let mut spec = String::from("%");
        while let Some(&n) = chars.peek() {
            spec.push(n);
            chars.next();
            if n.is_ascii_alphabetic() {
                break;
            }
        }
        let arg = args.get(arg_i).map(Value::render).unwrap_or_default();
        arg_i += 1;
        match spec.chars().last() {
            Some('s') | Some('v') => out.push_str(&arg),
            Some('d') => out.push_str(&format_d(&arg, &spec)),
            _ => out.push_str(&spec),
        }
    }
    out
}

// Formats one `%d` conversion: parses `arg` as an integer and applies the
// width / zero-pad flags carried in `spec` (e.g. `%04d`, `%10d`).
fn format_d(arg: &str, spec: &str) -> String {
    let n: i64 = arg.parse().unwrap_or(0);
    // Flags/width between '%' and 'd', e.g. "%04d" -> flags_width "04".
    let flags_width = &spec[1..spec.len() - 1];
    // Zero-pad only with an explicit leading '0' FLAG ("%04d"), not merely
    // because the width digits contain a 0 ("%10d").
    let zero_pad = flags_width.starts_with('0');
    let width: usize = flags_width.trim_start_matches('0').parse().unwrap_or(0);
    if zero_pad && width > 0 {
        format!("{n:0width$}")
    } else if width > 0 {
        format!("{n:width$}")
    } else {
        n.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::super::render;
    use super::super::test_support::ctx;
    use crate::context::Context;

    #[test]
    fn and_or_grouping() {
        let t = "{{ if and (.Keywords) (eq .Config.disablesort .False) }}Y{{ else }}N{{ end }}";
        assert_eq!(render(t, &ctx()), "Y");
    }

    #[test]
    fn join_categories() {
        assert_eq!(
            render("cat={{ join .Categories \",\" }}", &ctx()),
            "cat=1,3"
        );
    }

    #[test]
    fn re_replace_call() {
        // Cardigann funcs are input-first: `re_replace <input> <pat> <repl>`.
        let t = "{{ re_replace .Keywords \"[0-9]+\" \"\" }}";
        assert_eq!(render(t, &ctx()), "the matrix ");
    }

    #[test]
    fn printf_padding_and_empty_args() {
        // Explicit zero-pad flag vs a width that merely contains a 0 digit.
        assert_eq!(
            render("{{ printf \"%04d\" 5 }}", &Context::default()),
            "0005"
        );
        assert_eq!(
            render("{{ printf \"%10d\" 5 }}", &Context::default()),
            "         5"
        );
        assert_eq!(
            render("{{ printf \"%s-x\" \"a\" }}", &Context::default()),
            "a-x"
        );
        // Must not panic with no args.
        assert_eq!(render("{{ printf }}", &Context::default()), "");
    }

    #[test]
    fn replace_not_and_or() {
        // Cardigann funcs are input-first: replace <input> <old> <new>.
        assert_eq!(
            render(r#"{{ replace "hello" "l" "L" }}"#, &Context::default()),
            "heLLo"
        );
        // not inverts truthiness of a bool config.
        assert_eq!(
            render(
                "{{ if not .Config.freeleech }}Y{{ else }}N{{ end }}",
                &ctx()
            ),
            "Y"
        );
        // or returns the first truthy arg (fallback for a missing field).
        assert_eq!(
            render(r#"{{ or .Config.missing "fb" }}"#, &Context::default()),
            "fb"
        );
        // and returns the first falsy arg.
        assert_eq!(render(r#"{{ and "a" "" }}"#, &Context::default()), "");
    }

    #[test]
    fn comparisons_numeric_and_lexicographic() {
        let d = Context::default();
        // Both parse as numbers -> numeric comparison.
        assert_eq!(
            render(r#"{{ if lt "5" "10" }}Y{{ else }}N{{ end }}"#, &d),
            "Y"
        );
        assert_eq!(
            render(r#"{{ if gt "10" "5" }}Y{{ else }}N{{ end }}"#, &d),
            "Y"
        );
        assert_eq!(
            render(r#"{{ if le "5" "5" }}Y{{ else }}N{{ end }}"#, &d),
            "Y"
        );
        assert_eq!(
            render(r#"{{ if ge "5" "6" }}Y{{ else }}N{{ end }}"#, &d),
            "N"
        );
        // Non-numeric -> lexicographic comparison.
        assert_eq!(
            render(r#"{{ if lt "apple" "banana" }}Y{{ else }}N{{ end }}"#, &d),
            "Y"
        );
        assert_eq!(
            render(r#"{{ if ne "a" "b" }}Y{{ else }}N{{ end }}"#, &d),
            "Y"
        );
    }

    #[test]
    fn printf_conversions_and_unknown_spec() {
        let d = Context::default();
        assert_eq!(
            render(r#"{{ printf "%v/%s/%d" "a" "b" "7" }}"#, &d),
            "a/b/7"
        );
        // Unknown verb prints its spec verbatim.
        assert_eq!(render(r#"{{ printf "%q" "x" }}"#, &d), "%q");
        // Width without a zero-pad flag pads with spaces.
        assert_eq!(render(r#"{{ printf "%3d" "7" }}"#, &d), "  7");
    }

    #[test]
    fn or_falls_back_to_its_last_argument_when_nothing_is_truthy() {
        let d = Context::default();
        assert_eq!(render(r#"{{ or "" "fallback" }}"#, &d), "fallback");
        assert_eq!(render(r#"{{ or .Config.a .Config.b }}"#, &d), "");
    }

    #[test]
    fn a_comparison_missing_an_operand_is_false_rather_than_a_parse_error() {
        let c = ctx();
        assert_eq!(
            render("{{ if eq .Keywords }}Y{{ else }}N{{ end }}", &c),
            "N"
        );
        assert_eq!(render(r#"{{ if lt "5" }}Y{{ else }}N{{ end }}"#, &c), "N");
        assert_eq!(
            render(r#"{{ if lt "NaN" "5" }}Y{{ else }}N{{ end }}"#, &c),
            "N"
        );
    }
}
