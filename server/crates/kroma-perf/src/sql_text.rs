const MAX_CHARS: usize = 4_000;

/// The statement as one line, with every list of two or more placeholders
/// collapsed to `?…`, so the same query built for 3 ids and for 300 is one
/// entry. Values never appear: SQLite hands over the text it was prepared from.
pub fn normalize(sql: &str) -> String {
    let one_line = sql.split_whitespace().collect::<Vec<_>>().join(" ");
    let collapsed = collapse_placeholder_lists(&one_line);
    truncate(collapsed)
}

fn collapse_placeholder_lists(sql: &str) -> String {
    let bytes = sql.as_bytes();
    let mut out = String::with_capacity(sql.len());
    let mut i = 0;
    while i < bytes.len() {
        let Some(end) = placeholder_end(bytes, i) else {
            let ch = sql[i..].chars().next().unwrap_or(' ');
            out.push(ch);
            i += ch.len_utf8();
            continue;
        };
        let (list_end, items) = list_from(bytes, end);
        out.push_str(if items > 1 { "?…" } else { &sql[i..end] });
        i = list_end;
    }
    out
}

fn list_from(bytes: &[u8], first_end: usize) -> (usize, usize) {
    let (mut end, mut items) = (first_end, 1);
    loop {
        let next = skip_spaces(bytes, end);
        if bytes.get(next) != Some(&b',') {
            return (end, items);
        }
        let start = skip_spaces(bytes, next + 1);
        let Some(after) = placeholder_end(bytes, start) else {
            return (end, items);
        };
        end = after;
        items += 1;
    }
}

fn placeholder_end(bytes: &[u8], at: usize) -> Option<usize> {
    let sigil = *bytes.get(at)?;
    if !matches!(sigil, b'?' | b':' | b'@' | b'$') {
        return None;
    }
    let name_end = (at + 1..bytes.len())
        .find(|&j| !(bytes[j].is_ascii_alphanumeric() || bytes[j] == b'_'))
        .unwrap_or(bytes.len());
    let named = name_end > at + 1;
    (sigil == b'?' || named).then_some(name_end)
}

fn skip_spaces(bytes: &[u8], from: usize) -> usize {
    (from..bytes.len())
        .find(|&j| bytes[j] != b' ')
        .unwrap_or(bytes.len())
}

fn truncate(mut sql: String) -> String {
    if let Some((cut, _)) = sql.char_indices().nth(MAX_CHARS) {
        sql.truncate(cut);
        sql.push('…');
    }
    sql
}

#[cfg(test)]
mod tests {
    use super::normalize;

    #[test]
    fn a_statement_written_over_several_lines_reads_as_one() {
        let sql = "SELECT id,\n       title\n  FROM items\n WHERE id = ?1";

        assert_eq!(normalize(sql), "SELECT id, title FROM items WHERE id = ?1");
    }

    #[test]
    fn a_list_of_placeholders_of_any_length_is_one_template() {
        let three = normalize("SELECT * FROM files WHERE item_id IN (?1, ?2, ?3)");
        let many = normalize("SELECT * FROM files WHERE item_id IN (?,?,?,?,?,?,?,?)");

        assert_eq!(three, "SELECT * FROM files WHERE item_id IN (?…)");
        assert_eq!(many, three);
    }

    #[test]
    fn separate_parameters_stay_apart() {
        let sql = "UPDATE items SET title = :title WHERE id = :id AND kind = ?3";

        assert_eq!(normalize(sql), sql);
    }

    #[test]
    fn a_json_path_and_a_cast_are_not_placeholders() {
        let sql = "SELECT json_extract(metadata, '$.cast'), CAST(x AS INTEGER) FROM items";

        assert_eq!(normalize(sql), sql);
    }

    #[test]
    fn a_huge_statement_is_cut_with_a_marker() {
        let sql = format!("SELECT {}", "x, ".repeat(3_000));

        let normalized = normalize(&sql);

        assert_eq!(normalized.chars().count(), 4_001);
        assert!(normalized.ends_with('…'));
    }
}
