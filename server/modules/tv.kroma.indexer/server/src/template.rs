//! A focused interpreter for the Go `text/template` subset that Cardigann
//! definitions use. It is not a general Go-template engine: it supports exactly
//! the constructs that appear in real definitions -
//!
//! - interpolation: `{{ .Keywords }}`, `{{ .Config.sort }}`, `{{ .Result.x }}`
//! - conditionals: `{{ if COND }}…{{ else }}…{{ end }}`
//! - iteration: `{{ range .Categories }}…{{ . }}…{{ end }}`
//! - pipelines: `{{ .Keywords | re_replace "a" "b" }}`
//! - functions: `join`, `re_replace`, `replace`, `and`, `or`, `not`,
//!   `eq`, `ne`, `lt`, `le`, `gt`, `ge`, `printf`
//! - literals: `"double"`, `` `raw` ``, numbers, and the `.True`/`.False`
//!   constants
//! - whitespace trim markers `{{-` / `-}}`
//!
//! Anything unrecognized renders to empty rather than aborting the search, so a
//! definition using one exotic feature still returns results for the common
//! path.

use crate::context::{Context, Value};

/// Render a template string against a context. Parse errors degrade to a
/// best-effort literal rather than failing the whole search.
pub fn render(input: &str, ctx: &Context) -> String {
    match parse(input) {
        Ok(nodes) => {
            let mut out = String::new();
            eval_nodes(&nodes, ctx, &mut out);
            out
        }
        // A malformed template is far better surfaced as its literal source than
        // as a hard error that hides every release.
        Err(_) => input.to_string(),
    }
}

#[derive(Debug, Clone)]
enum Node {
    Text(String),
    Action(Pipeline),
    If { cond: Pipeline, then: Vec<Node>, els: Vec<Node> },
    Range { expr: Pipeline, body: Vec<Node> },
}

type Pipeline = Vec<Command>;

#[derive(Debug, Clone)]
struct Command {
    terms: Vec<Term>,
}

#[derive(Debug, Clone)]
enum Term {
    Field(Vec<String>),
    Str(String),
    Ident(String),
    Group(Pipeline),
}

#[derive(Debug)]
enum Chunk {
    Text(String),
    Action(String),
}

fn lex(input: &str) -> Vec<Chunk> {
    let bytes = input.as_bytes();
    let mut chunks = Vec::new();
    let mut i = 0;
    let mut text = String::new();
    while i < bytes.len() {
        if bytes[i] == b'{' && i + 1 < bytes.len() && bytes[i + 1] == b'{' {
            match lex_action(input, bytes, i, &mut text, &mut chunks) {
                Some(next) => {
                    i = next;
                    continue;
                }
                None => break,
            }
        }
        let ch_len = utf8_len(bytes[i]);
        text.push_str(&input[i..i + ch_len]);
        i += ch_len;
    }
    if !text.is_empty() {
        chunks.push(Chunk::Text(text));
    }
    chunks
}

// Lexes a single `{{ … }}` action starting at the opening `{{` (index `i`),
// flushing any pending `text` and appending the action chunk. Returns the
// index just past the action to continue from, or `None` when there is no
// closing `}}` (the caller should stop).
fn lex_action(
    input: &str,
    bytes: &[u8],
    i: usize,
    text: &mut String,
    chunks: &mut Vec<Chunk>,
) -> Option<usize> {
    // Whitespace-trim marker `{{-` trims trailing text whitespace.
    let mut j = i + 2;
    if bytes.get(j) == Some(&b'-') {
        j += 1;
        let trimmed = text.trim_end().len();
        text.truncate(trimmed);
    }
    if !text.is_empty() {
        chunks.push(Chunk::Text(std::mem::take(text)));
    }
    let Some(rel) = input[j..].find("}}") else {
        // No close: treat the rest as literal text.
        text.push_str(&input[i..]);
        return None;
    };
    let mut body = &input[j..j + rel];
    let mut next = j + rel + 2;
    // `-}}` trims leading whitespace of the following text.
    if body.ends_with('-') {
        body = &body[..body.len() - 1];
        while next < bytes.len() && bytes[next].is_ascii_whitespace() {
            next += 1;
        }
    }
    chunks.push(Chunk::Action(body.trim().to_string()));
    Some(next)
}

fn utf8_len(b: u8) -> usize {
    match b {
        0x00..=0x7f => 1,
        0xc0..=0xdf => 2,
        0xe0..=0xef => 3,
        _ => 4,
    }
}

fn parse(input: &str) -> Result<Vec<Node>, String> {
    let chunks = lex(input);
    let mut pos = 0;
    let (nodes, stop) = parse_seq(&chunks, &mut pos)?;
    if stop.is_some() {
        return Err(format!("unexpected {:?}", stop));
    }
    Ok(nodes)
}

// Parses a sequence of nodes, stopping (without consuming) at `else`/`end`.
// Returns the control keyword that stopped it, if any.
fn parse_seq(chunks: &[Chunk], pos: &mut usize) -> Result<(Vec<Node>, Option<String>), String> {
    let mut nodes = Vec::new();
    while *pos < chunks.len() {
        match &chunks[*pos] {
            Chunk::Text(t) => {
                nodes.push(Node::Text(t.clone()));
                *pos += 1;
            }
            Chunk::Action(body) => {
                let (head, rest) = split_head(body);
                match head {
                    "end" | "else" => return Ok((nodes, Some(head.to_string()))),
                    "if" | "with" => {
                        *pos += 1;
                        nodes.push(parse_if(chunks, pos, rest)?);
                    }
                    "range" => {
                        *pos += 1;
                        nodes.push(parse_range(chunks, pos, rest)?);
                    }
                    _ => {
                        *pos += 1;
                        nodes.push(Node::Action(parse_pipeline(body)?));
                    }
                }
            }
        }
    }
    Ok((nodes, None))
}

// Parses an `{{ if COND }}…{{ else }}…{{ end }}` body after its head token was
// consumed. `rest` is the condition expression.
fn parse_if(chunks: &[Chunk], pos: &mut usize, rest: &str) -> Result<Node, String> {
    let cond = parse_pipeline(rest)?;
    let (then, stop) = parse_seq(chunks, pos)?;
    let mut els = Vec::new();
    if stop.as_deref() == Some("else") {
        *pos += 1;
        let (e, stop2) = parse_seq(chunks, pos)?;
        if stop2.as_deref() != Some("end") {
            return Err("if: missing end".into());
        }
        *pos += 1;
        els = e;
    } else if stop.as_deref() == Some("end") {
        *pos += 1;
    } else {
        return Err("if: missing end".into());
    }
    Ok(Node::If { cond, then, els })
}

// Parses a `{{ range EXPR }}…{{ end }}` body after its head token was consumed.
fn parse_range(chunks: &[Chunk], pos: &mut usize, rest: &str) -> Result<Node, String> {
    let expr = parse_pipeline(rest)?;
    let (body, stop) = parse_seq(chunks, pos)?;
    if stop.as_deref() != Some("end") {
        return Err("range: missing end".into());
    }
    *pos += 1;
    Ok(Node::Range { expr, body })
}

// Splits the first bareword off an action body (`if and (x) (y)` -> `("if", "and (x) (y)")`).
fn split_head(body: &str) -> (&str, &str) {
    let body = body.trim();
    match body.find(char::is_whitespace) {
        Some(i) => (&body[..i], body[i..].trim_start()),
        None => (body, ""),
    }
}

// Tokens inside an action body.
#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Pipe,
    LParen,
    RParen,
    Field(Vec<String>),
    Str(String),
    Ident(String),
}

fn tokenize_expr(s: &str) -> Result<Vec<Tok>, String> {
    let chars: Vec<char> = s.chars().collect();
    let mut toks = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
        } else if c == '|' {
            toks.push(Tok::Pipe);
            i += 1;
        } else if c == '(' {
            toks.push(Tok::LParen);
            i += 1;
        } else if c == ')' {
            toks.push(Tok::RParen);
            i += 1;
        } else if c == '"' || c == '`' {
            let (lit, next) = lex_string(&chars, i);
            i = next;
            toks.push(Tok::Str(lit));
        } else if c == '.' {
            // A dotted field: `.A.B` or a bare `.`.
            let (segs, next) = lex_field(&chars, i);
            i = next;
            toks.push(Tok::Field(segs));
        } else {
            // Identifier / number / function name.
            let (word, next) = lex_word(&chars, i);
            i = next;
            toks.push(Tok::Ident(word));
        }
    }
    Ok(toks)
}

// Lexes a quoted string literal starting at the opening quote `chars[i]`
// (either `"` with escapes or a raw `` ` ``). Returns the literal and the
// index just past the closing quote.
fn lex_string(chars: &[char], mut i: usize) -> (String, usize) {
    let quote = chars[i];
    i += 1;
    let mut lit = String::new();
    while i < chars.len() && chars[i] != quote {
        if quote == '"' && chars[i] == '\\' && i + 1 < chars.len() {
            i += 1;
            lit.push(match chars[i] {
                'n' => '\n',
                't' => '\t',
                'r' => '\r',
                other => other,
            });
        } else {
            lit.push(chars[i]);
        }
        i += 1;
    }
    i += 1; // closing quote
    (lit, i)
}

// Lexes a dotted field (`.A.B` or a bare `.`) starting at `chars[start] == '.'`.
// Returns the segments and the index just past the field.
fn lex_field(chars: &[char], start: usize) -> (Vec<String>, usize) {
    let mut i = start + 1;
    while i < chars.len() && (chars[i].is_alphanumeric() || chars[i] == '_' || chars[i] == '.') {
        i += 1;
    }
    let raw: String = chars[start..i].iter().collect();
    let segs: Vec<String> =
        raw.trim_start_matches('.').split('.').filter(|s| !s.is_empty()).map(String::from).collect();
    (segs, i)
}

// Lexes a bareword (identifier / number / function name) from `chars[start]`.
// Returns the word and the index just past it.
fn lex_word(chars: &[char], start: usize) -> (String, usize) {
    let mut i = start;
    while i < chars.len() && !chars[i].is_whitespace() && !matches!(chars[i], '|' | '(' | ')') {
        i += 1;
    }
    let word: String = chars[start..i].iter().collect();
    (word, i)
}

fn parse_pipeline(s: &str) -> Result<Pipeline, String> {
    if s.trim().is_empty() {
        return Ok(vec![]);
    }
    let toks = tokenize_expr(s)?;
    let mut pos = 0;
    let pipe = parse_pipeline_toks(&toks, &mut pos)?;
    Ok(pipe)
}

// Parses commands separated by `|`, consuming until a top-level `)` or the end.
fn parse_pipeline_toks(toks: &[Tok], pos: &mut usize) -> Result<Pipeline, String> {
    let mut commands = Vec::new();
    commands.push(parse_command(toks, pos)?);
    while *pos < toks.len() && toks[*pos] == Tok::Pipe {
        *pos += 1;
        commands.push(parse_command(toks, pos)?);
    }
    Ok(commands)
}

fn parse_command(toks: &[Tok], pos: &mut usize) -> Result<Command, String> {
    let mut terms = Vec::new();
    while *pos < toks.len() {
        match &toks[*pos] {
            Tok::Pipe | Tok::RParen => break,
            Tok::LParen => {
                *pos += 1;
                let inner = parse_pipeline_toks(toks, pos)?;
                if *pos >= toks.len() || toks[*pos] != Tok::RParen {
                    return Err("missing )".into());
                }
                *pos += 1;
                terms.push(Term::Group(inner));
            }
            Tok::Field(segs) => {
                terms.push(Term::Field(segs.clone()));
                *pos += 1;
            }
            Tok::Str(s) => {
                terms.push(Term::Str(s.clone()));
                *pos += 1;
            }
            Tok::Ident(w) => {
                terms.push(Term::Ident(w.clone()));
                *pos += 1;
            }
        }
    }
    if terms.is_empty() {
        return Err("empty command".into());
    }
    Ok(Command { terms })
}

fn eval_nodes(nodes: &[Node], ctx: &Context, out: &mut String) {
    for node in nodes {
        match node {
            Node::Text(t) => out.push_str(t),
            Node::Action(pipe) => out.push_str(&eval_pipeline(pipe, ctx).render()),
            Node::If { cond, then, els } => {
                if eval_pipeline(cond, ctx).truthy() {
                    eval_nodes(then, ctx, out);
                } else {
                    eval_nodes(els, ctx, out);
                }
            }
            Node::Range { expr, body } => {
                if let Value::List(items) = eval_pipeline(expr, ctx) {
                    for item in items {
                        let mut inner = ctx.clone();
                        inner.dot = Some(Value::Str(item));
                        eval_nodes(body, &inner, out);
                    }
                }
            }
        }
    }
}

fn eval_pipeline(pipe: &[Command], ctx: &Context) -> Value {
    let mut piped: Option<Value> = None;
    for cmd in pipe {
        piped = Some(eval_command(cmd, ctx, piped.take()));
    }
    piped.unwrap_or(Value::Nil)
}

fn eval_command(cmd: &Command, ctx: &Context, piped: Option<Value>) -> Value {
    // A single non-function term is just a value (a piped value, if any, is
    // ignored for a bare term - pipelines only feed function commands).
    let first = &cmd.terms[0];
    if let Term::Ident(name) = first {
        if is_function(name) {
            let mut args: Vec<Value> = cmd.terms[1..].iter().map(|t| eval_term(t, ctx)).collect();
            if let Some(p) = piped {
                args.push(p);
            }
            return call_function(name, &args);
        }
        // A bare identifier that isn't a function: treat as a string literal
        // (covers numbers and stray words).
        return Value::Str(name.clone());
    }
    if cmd.terms.len() == 1 {
        return eval_term(first, ctx);
    }
    // Multiple terms with a non-ident head: evaluate the head only.
    eval_term(first, ctx)
}

fn eval_term(term: &Term, ctx: &Context) -> Value {
    match term {
        Term::Field(segs) => {
            let refs: Vec<&str> = segs.iter().map(String::as_str).collect();
            ctx.resolve(&refs)
        }
        Term::Str(s) => Value::Str(s.clone()),
        Term::Ident(w) => Value::Str(w.clone()),
        Term::Group(pipe) => eval_pipeline(pipe, ctx),
    }
}

fn is_function(name: &str) -> bool {
    matches!(
        name,
        "join" | "re_replace" | "replace" | "and" | "or" | "not" | "eq" | "ne" | "lt" | "le"
            | "gt" | "ge" | "printf"
    )
}

fn call_function(name: &str, args: &[Value]) -> Value {
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
    use super::*;
    use crate::context::Value;
    use std::collections::HashMap;

    fn ctx() -> Context {
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

    #[test]
    fn interpolation_and_config() {
        assert_eq!(render("q={{ .Keywords }}", &ctx()), "q=the matrix 1999");
        assert_eq!(render("u={{ .Config.username }}", &ctx()), "u=alice");
    }

    #[test]
    fn if_else_with_bool_config() {
        // freeleech is false -> else branch.
        assert_eq!(render("{{ if .Config.freeleech }}fl{{ else }}no{{ end }}", &ctx()), "no");
        // eq against the .False constant.
        let t = "{{ if eq .Config.disablesort .False }}sort{{ else }}x{{ end }}";
        assert_eq!(render(t, &ctx()), "sort");
    }

    #[test]
    fn and_or_grouping() {
        let t = "{{ if and (.Keywords) (eq .Config.disablesort .False) }}Y{{ else }}N{{ end }}";
        assert_eq!(render(t, &ctx()), "Y");
    }

    #[test]
    fn join_categories() {
        assert_eq!(render("cat={{ join .Categories \",\" }}", &ctx()), "cat=1,3");
    }

    #[test]
    fn range_categories() {
        assert_eq!(render("{{ range .Categories }}[{{ . }}]{{ end }}", &ctx()), "[1][3]");
    }

    #[test]
    fn re_replace_call() {
        // Cardigann funcs are input-first: `re_replace <input> <pat> <repl>`.
        let t = "{{ re_replace .Keywords \"[0-9]+\" \"\" }}";
        assert_eq!(render(t, &ctx()), "the matrix ");
    }

    #[test]
    fn result_reference() {
        let mut c = ctx();
        c.result.insert("_id".into(), "42".into());
        assert_eq!(render("/torrent/{{ .Result._id }}", &c), "/torrent/42");
    }

    #[test]
    fn printf_padding_and_empty_args() {
        // Explicit zero-pad flag vs a width that merely contains a 0 digit.
        assert_eq!(render("{{ printf \"%04d\" 5 }}", &Context::default()), "0005");
        assert_eq!(render("{{ printf \"%10d\" 5 }}", &Context::default()), "         5");
        assert_eq!(render("{{ printf \"%s-x\" \"a\" }}", &Context::default()), "a-x");
        // Must not panic with no args.
        assert_eq!(render("{{ printf }}", &Context::default()), "");
    }

    #[test]
    fn renders_templated_base_url() {
        let mut config = HashMap::new();
        config.insert("apiurl".to_string(), Value::Str("api.example.org".into()));
        let ctx = Context { config, ..Default::default() };
        assert_eq!(render("https://{{ .Config.apiurl }}", &ctx), "https://api.example.org");
        // Undefined config key renders empty, never the literal braces.
        assert_eq!(render("https://{{ .Config.missing }}", &Context::default()), "https://");
    }

    #[test]
    fn whitespace_trim_markers() {
        assert_eq!(render("a {{- \"b\" }}", &ctx()), "ab");
        assert_eq!(render("{{ \"a\" -}} b", &ctx()), "ab");
    }

    #[test]
    fn replace_not_and_or() {
        // Cardigann funcs are input-first: replace <input> <old> <new>.
        assert_eq!(render(r#"{{ replace "hello" "l" "L" }}"#, &Context::default()), "heLLo");
        // not inverts truthiness of a bool config.
        assert_eq!(render("{{ if not .Config.freeleech }}Y{{ else }}N{{ end }}", &ctx()), "Y");
        // or returns the first truthy arg (fallback for a missing field).
        assert_eq!(render(r#"{{ or .Config.missing "fb" }}"#, &Context::default()), "fb");
        // and returns the first falsy arg.
        assert_eq!(render(r#"{{ and "a" "" }}"#, &Context::default()), "");
    }

    #[test]
    fn comparisons_numeric_and_lexicographic() {
        let d = Context::default();
        // Both parse as numbers -> numeric comparison.
        assert_eq!(render(r#"{{ if lt "5" "10" }}Y{{ else }}N{{ end }}"#, &d), "Y");
        assert_eq!(render(r#"{{ if gt "10" "5" }}Y{{ else }}N{{ end }}"#, &d), "Y");
        assert_eq!(render(r#"{{ if le "5" "5" }}Y{{ else }}N{{ end }}"#, &d), "Y");
        assert_eq!(render(r#"{{ if ge "5" "6" }}Y{{ else }}N{{ end }}"#, &d), "N");
        // Non-numeric -> lexicographic comparison.
        assert_eq!(render(r#"{{ if lt "apple" "banana" }}Y{{ else }}N{{ end }}"#, &d), "Y");
        assert_eq!(render(r#"{{ if ne "a" "b" }}Y{{ else }}N{{ end }}"#, &d), "Y");
    }

    #[test]
    fn printf_conversions_and_unknown_spec() {
        let d = Context::default();
        assert_eq!(render(r#"{{ printf "%v/%s/%d" "a" "b" "7" }}"#, &d), "a/b/7");
        // Unknown verb prints its spec verbatim.
        assert_eq!(render(r#"{{ printf "%q" "x" }}"#, &d), "%q");
        // Width without a zero-pad flag pads with spaces.
        assert_eq!(render(r#"{{ printf "%3d" "7" }}"#, &d), "  7");
    }

    #[test]
    fn range_over_non_list_and_bare_ident() {
        // Ranging a scalar iterates nothing (only lists iterate).
        assert_eq!(render("a{{ range .Keywords }}x{{ end }}b", &ctx()), "ab");
        // A bare word that is not a function renders as itself.
        assert_eq!(render("{{ foo }}", &Context::default()), "foo");
        // A bare number likewise.
        assert_eq!(render("{{ 42 }}", &Context::default()), "42");
    }

    #[test]
    fn malformed_templates_degrade_to_literal() {
        // Missing {{ end }} -> parse error -> literal source returned.
        let t = "{{ if .Keywords }}open";
        assert_eq!(render(t, &ctx()), t);
        // Unterminated action -> literal.
        assert_eq!(render("a {{ b", &ctx()), "a {{ b");
    }

    #[test]
    fn with_keyword_behaves_like_if() {
        assert_eq!(render("{{ with .Keywords }}Y{{ else }}N{{ end }}", &ctx()), "Y");
        assert_eq!(
            render("{{ with .Config.missing }}Y{{ else }}N{{ end }}", &Context::default()),
            "N"
        );
    }

    #[test]
    fn list_interpolation_and_join_on_scalar() {
        // A list interpolates space-joined.
        assert_eq!(render("{{ .Categories }}", &ctx()), "1 3");
        // join on a scalar just renders the scalar.
        assert_eq!(render(r#"{{ join .Keywords "," }}"#, &ctx()), "the matrix 1999");
        // An invalid regex in re_replace leaves the input untouched.
        assert_eq!(render(r#"{{ re_replace .Keywords "[" "x" }}"#, &ctx()), "the matrix 1999");
    }
    // A definition is community-maintained YAML and will contain typos; each of
    // these would otherwise be a hard error hiding every release from that
    // tracker, so `render` falls back to the literal source instead.

    #[track_caller]
    fn unchanged(template: &str) {
        assert_eq!(render(template, &ctx()), template, "should have come back verbatim");
    }

    #[test]
    fn an_if_without_an_end_is_left_as_written() {
        unchanged("{{ if .Config.freeleech }}&free=1");
    }

    #[test]
    fn a_range_without_an_end_is_left_as_written() {
        unchanged("{{ range .Categories }}&cat={{ . }}");
    }

    #[test]
    fn a_stray_end_or_else_is_left_as_written() {
        unchanged("&x=1{{ end }}");
        unchanged("&x=1{{ else }}&y=2");
    }

    #[test]
    fn an_unbalanced_parenthesis_is_left_as_written() {
        unchanged("{{ if (eq .Config.sort \"seeders\" }}&s=1{{ end }}");
    }

    #[test]
    fn an_empty_action_emits_nothing_but_a_dangling_pipe_is_an_error() {
        // Two different shapes with two different answers, worth stating because
        // they look alike: `{{ }}` PARSES (an empty pipeline, which evaluates to
        // nothing), while `{{ | }}` is a pipe with no command on either side and
        // falls back to the source.
        assert_eq!(render("{{ }}", &ctx()), "");
        unchanged("{{ | }}");
    }

    #[test]
    fn an_unterminated_string_stops_at_the_end_of_its_action() {
        // The action body is split on `}}` before it is tokenized, so an unclosed
        // quote runs to the end of THAT action rather than swallowing the rest of
        // the template - and never indexes past the input.
        assert_eq!(
            render("{{ if eq .Config.sort \"seeders }}&s=1{{ end }}", &ctx()),
            "&s=1",
            "the quote should close at the action boundary",
        );
    }



    #[test]
    fn a_multibyte_template_is_not_split_mid_character() {
        // Definitions carry accented and CJK literals. The lexer advances by
        // UTF-8 length on purpose: slicing mid-character would panic.
        let c = ctx();
        assert_eq!(render("&q=Téléchargé", &c), "&q=Téléchargé");
        assert_eq!(render("&q=ダウンロード", &c), "&q=ダウンロード");
        // ...including around an action.
        assert_eq!(render("é{{ .Keywords }}é", &c), "éthe matrix 1999é");
        // ...and inside a broken one, where the fallback returns the source.
        unchanged("é{{ if .Config.freeleech }}é");
    }

    #[test]
    fn a_template_with_no_actions_at_all_is_passed_straight_through() {
        let c = ctx();
        assert_eq!(render("", &c), "");
        assert_eq!(render("/browse.php?x=1", &c), "/browse.php?x=1");
        // A lone brace is text, not the start of an action.
        assert_eq!(render("a{b}c", &c), "a{b}c");
    }

    #[test]
    fn an_unknown_field_renders_empty_rather_than_the_expression() {
        // The tracker gets `&x=` instead of `&x={{ .Config.nope }}`, which at
        // worst returns nothing - sending the raw expression would look like a
        // search term.
        assert_eq!(render("&x={{ .Config.nope }}", &ctx()), "&x=");
    }
}
