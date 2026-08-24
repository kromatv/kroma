use crate::infra::llm::LlmClient;

use super::Cue;

pub(super) fn translate_batch(
    llm: &dyn LlmClient,
    batch: &[Cue],
    target_lang: &str,
    token_cap: u32,
) -> std::result::Result<Vec<Option<String>>, String> {
    let numbered: String = batch
        .iter()
        .enumerate()
        .map(|(i, c)| format!("{}. {}\n", i + 1, c.text.replace('\n', " ")))
        .collect();
    let system = format!(
        "You are a professional subtitle translator. Translate each numbered subtitle line into {target_lang}. \
         Output EXACTLY the same number of lines, each prefixed with its number and a period, and NOTHING else. \
         Preserve meaning and tone; keep proper nouns. Do not merge or split lines."
    );
    let max_tokens = ((batch.len() as u32) * 80 + 200).min(token_cap);
    let reply = llm
        .complete(&system, &numbered, max_tokens)
        .map_err(|e| format!("LLM request failed: {e:#}"))?;
    // None marks a gap; the caller keeps that cue's original text instead of blanking it.
    let mut out: Vec<Option<String>> = vec![None; batch.len()];
    let mut filled = 0;
    for line in reply.lines() {
        let line = line.trim();
        let Some((num, rest)) = line.split_once('.') else {
            continue;
        };
        if let Ok(n) = num.trim().parse::<usize>() {
            let rest = rest.trim();
            if n >= 1 && n <= batch.len() && !rest.is_empty() {
                out[n - 1] = Some(rest.to_string());
                filled += 1;
            }
        }
    }
    // At least half the lines must parse, or the batch is treated as failed.
    if filled * 2 >= batch.len() {
        Ok(out)
    } else {
        Err(format!(
            "model reply did not match the numbered format ({filled}/{} lines parsed); reply began: {}",
            batch.len(),
            snippet(&reply),
        ))
    }
}

fn snippet(text: &str) -> String {
    let one_line: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if one_line.chars().count() > 160 {
        format!("{}…", one_line.chars().take(160).collect::<String>())
    } else {
        one_line
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::subtitles::translate::test_support::{cue, FakeLlm};

    #[test]
    fn translate_batch_parses_numbered_reply() {
        let llm = FakeLlm {
            reply: Ok("1. Bonjour\n2. Salut".to_string()),
        };
        let batch = [cue("t0", "Hello"), cue("t1", "Hi")];
        let out = translate_batch(&llm, &batch, "French", 8192).unwrap();
        assert_eq!(
            out,
            vec![Some("Bonjour".to_string()), Some("Salut".to_string())]
        );
    }

    #[test]
    fn translate_batch_keeps_gap_as_none_when_mostly_parsed() {
        let llm = FakeLlm {
            reply: Ok("1. Bonjour".to_string()),
        };
        let batch = [cue("t0", "Hello"), cue("t1", "Hi")];
        let out = translate_batch(&llm, &batch, "French", 8192).unwrap();
        assert_eq!(out, vec![Some("Bonjour".to_string()), None]);
    }

    #[test]
    fn translate_batch_errors_when_reply_unparseable() {
        let llm = FakeLlm {
            reply: Ok("1. Bonjour\ngarbage without numbers".to_string()),
        };
        let batch = [
            cue("t0", "a"),
            cue("t1", "b"),
            cue("t2", "c"),
            cue("t3", "d"),
        ];
        let err = translate_batch(&llm, &batch, "French", 8192).unwrap_err();
        assert!(err.contains("numbered format"), "unexpected error: {err}");
    }

    #[test]
    fn translate_batch_propagates_llm_error() {
        let llm = FakeLlm { reply: Err(()) };
        let batch = [cue("t0", "Hello")];
        let err = translate_batch(&llm, &batch, "French", 8192).unwrap_err();
        assert!(
            err.contains("LLM request failed"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn snippet_collapses_whitespace_and_caps_length() {
        assert_eq!(snippet("  hello\n\tworld  "), "hello world");
        let long = "x ".repeat(200);
        let s = snippet(&long);
        assert!(s.chars().count() <= 161); // 160 chars + the ellipsis
        assert!(s.ends_with('…'));
    }

    #[test]
    fn translate_batch_ignores_out_of_range_line_numbers() {
        let llm = FakeLlm {
            reply: Ok("1. Bonjour\n5. Stray".to_string()),
        };
        let batch = [cue("t0", "Hello"), cue("t1", "Hi")];
        let out = translate_batch(&llm, &batch, "French", 8192).unwrap();
        assert_eq!(out, vec![Some("Bonjour".to_string()), None]);
    }
}
