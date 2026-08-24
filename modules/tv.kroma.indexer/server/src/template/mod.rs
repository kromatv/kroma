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

use crate::context::Context;

mod builtins;
mod eval;
mod expr;
mod lex;
mod parse;
#[cfg(test)]
mod test_support;

use eval::eval_nodes;
use parse::parse;

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
    If {
        cond: Pipeline,
        then: Vec<Node>,
        els: Vec<Node>,
    },
    Range {
        expr: Pipeline,
        body: Vec<Node>,
    },
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
