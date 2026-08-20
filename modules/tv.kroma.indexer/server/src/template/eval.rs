use crate::context::{Context, Value};

use super::builtins::{call_function, is_function};
use super::{Command, Node, Term};

pub(super) fn eval_nodes(nodes: &[Node], ctx: &Context, out: &mut String) {
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

#[cfg(test)]
mod tests {
    use super::super::render;
    use super::super::test_support::ctx;
    use crate::context::{Context, Value};
    use std::collections::HashMap;

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
    fn range_categories() {
        assert_eq!(render("{{ range .Categories }}[{{ . }}]{{ end }}", &ctx()), "[1][3]");
    }


    #[test]
    fn result_reference() {
        let mut c = ctx();
        c.result.insert("_id".into(), "42".into());
        assert_eq!(render("/torrent/{{ .Result._id }}", &c), "/torrent/42");
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
    fn range_over_non_list_and_bare_ident() {
        // Ranging a scalar iterates nothing (only lists iterate).
        assert_eq!(render("a{{ range .Keywords }}x{{ end }}b", &ctx()), "ab");
        // A bare word that is not a function renders as itself.
        assert_eq!(render("{{ foo }}", &Context::default()), "foo");
        // A bare number likewise.
        assert_eq!(render("{{ 42 }}", &Context::default()), "42");
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
    #[test]
    fn a_pipeline_feeds_its_value_in_as_the_last_argument() {
        let d = Context::default();
        assert_eq!(render(r#"{{ "x" | printf "%s!" }}"#, &d), "x!");
        assert_eq!(render(r#"{{ .Keywords | printf "q=%s" }}"#, &ctx()), "q=the matrix 1999");
    }

    #[test]
    fn a_command_whose_head_is_not_a_function_evaluates_only_its_head() {
        assert_eq!(render(r#"{{ .Keywords "ignored" }}"#, &ctx()), "the matrix 1999");
        assert_eq!(render(r#"{{ "just-this" "ignored" }}"#, &Context::default()), "just-this");
    }

    #[test]
    fn a_function_called_with_no_arguments_at_all_renders_empty() {
        assert_eq!(render("{{ join }}", &ctx()), "");
        assert_eq!(render("{{ or }}", &Context::default()), "false");
        assert_eq!(render("{{ and }}", &Context::default()), "true");
    }


    #[test]
    fn an_unknown_field_renders_empty_rather_than_the_expression() {
        // The tracker gets `&x=` instead of `&x={{ .Config.nope }}`, which at
        // worst returns nothing - sending the raw expression would look like a
        // search term.
        assert_eq!(render("&x={{ .Config.nope }}", &ctx()), "&x=");
    }
}
