use super::expr::parse_pipeline;
use super::lex::{lex, Chunk};
use super::Node;

pub(super) fn parse(input: &str) -> Result<Vec<Node>, String> {
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

#[cfg(test)]
mod tests {
    use super::super::render;
    use super::super::test_support::{ctx, unchanged};

    #[test]
    fn malformed_templates_degrade_to_literal() {
        // Missing {{ end }} -> parse error -> literal source returned.
        let t = "{{ if .Keywords }}open";
        assert_eq!(render(t, &ctx()), t);
        // Unterminated action -> literal.
        assert_eq!(render("a {{ b", &ctx()), "a {{ b");
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
    fn an_else_branch_without_an_end_is_left_as_written() {
        unchanged("{{ if .Config.freeleech }}&free=1{{ else }}&free=0");
    }
}
