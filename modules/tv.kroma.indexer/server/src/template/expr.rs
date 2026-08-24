use super::{Command, Pipeline, Term};

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
    let segs: Vec<String> = raw
        .trim_start_matches('.')
        .split('.')
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect();
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

pub(super) fn parse_pipeline(s: &str) -> Result<Pipeline, String> {
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

#[cfg(test)]
mod tests {
    use super::super::render;
    use super::super::test_support::{ctx, unchanged};
    use crate::context::Context;

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
    fn escape_sequences_inside_a_double_quoted_literal_are_decoded() {
        let d = Context::default();
        assert_eq!(render(r#"{{ replace "a b" " " "\n" }}"#, &d), "a\nb");
        assert_eq!(render(r#"{{ replace "a b" " " "\t" }}"#, &d), "a\tb");
        assert_eq!(render(r#"{{ replace "a b" " " "\r" }}"#, &d), "a\rb");
        assert_eq!(render(r#"{{ replace "a b" " " "\q" }}"#, &d), "aqb");
        assert_eq!(render("{{ `raw\\nliteral` }}", &d), "raw\\nliteral");
    }
}
