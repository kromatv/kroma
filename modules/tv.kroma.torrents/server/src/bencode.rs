//! Reading bencode, the format of a `.torrent` and of a tracker's answer. The
//! bytes come off the network, so depth is bounded and every length is checked.

const MAX_DEPTH: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Value<'a> {
    Int(i64),
    Bytes(&'a [u8]),
    List(Vec<Node<'a>>),
    Dict(Vec<(&'a [u8], Node<'a>)>),
}

/// One decoded value and the exact bytes it was read from, which is what a
/// torrent's info hash is taken over.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Node<'a> {
    pub value: Value<'a>,
    pub raw: &'a [u8],
}

impl<'a> Node<'a> {
    pub fn get(&self, key: &[u8]) -> Option<&Node<'a>> {
        let Value::Dict(entries) = &self.value else {
            return None;
        };
        entries
            .iter()
            .find(|(name, _)| *name == key)
            .map(|(_, node)| node)
    }

    pub fn bytes(&self) -> Option<&'a [u8]> {
        match self.value {
            Value::Bytes(bytes) => Some(bytes),
            _ => None,
        }
    }

    pub fn int(&self) -> Option<i64> {
        match self.value {
            Value::Int(number) => Some(number),
            _ => None,
        }
    }

    pub fn list(&self) -> Option<&[Node<'a>]> {
        match &self.value {
            Value::List(items) => Some(items),
            _ => None,
        }
    }
}

/// The first value in `bytes`. What follows it is ignored, because trackers pad
/// their answers. `None` for anything malformed.
pub(crate) fn parse(bytes: &[u8]) -> Option<Node<'_>> {
    node(bytes, 0, 0).map(|(node, _)| node)
}

fn node(bytes: &[u8], at: usize, depth: usize) -> Option<(Node<'_>, usize)> {
    if depth > MAX_DEPTH {
        return None;
    }
    let (value, end) = match *bytes.get(at)? {
        b'i' => int(bytes, at + 1)?,
        b'l' => list(bytes, at + 1, depth)?,
        b'd' => dict(bytes, at + 1, depth)?,
        b'0'..=b'9' => {
            let (text, end) = byte_string(bytes, at)?;
            (Value::Bytes(text), end)
        }
        _ => return None,
    };
    Some((
        Node {
            value,
            raw: bytes.get(at..end)?,
        },
        end,
    ))
}

fn int(bytes: &[u8], at: usize) -> Option<(Value<'_>, usize)> {
    let length = bytes.get(at..)?.iter().position(|byte| *byte == b'e')?;
    let digits = std::str::from_utf8(bytes.get(at..at + length)?).ok()?;
    Some((Value::Int(digits.parse().ok()?), at + length + 1))
}

fn byte_string(bytes: &[u8], at: usize) -> Option<(&[u8], usize)> {
    let colon = at + bytes.get(at..)?.iter().position(|byte| *byte == b':')?;
    let length: usize = std::str::from_utf8(bytes.get(at..colon)?)
        .ok()?
        .parse()
        .ok()?;
    let start = colon + 1;
    let end = start.checked_add(length)?;
    Some((bytes.get(start..end)?, end))
}

fn list(bytes: &[u8], mut at: usize, depth: usize) -> Option<(Value<'_>, usize)> {
    let mut items = Vec::new();
    while *bytes.get(at)? != b'e' {
        let (item, end) = node(bytes, at, depth + 1)?;
        items.push(item);
        at = end;
    }
    Some((Value::List(items), at + 1))
}

fn dict(bytes: &[u8], mut at: usize, depth: usize) -> Option<(Value<'_>, usize)> {
    let mut entries = Vec::new();
    while *bytes.get(at)? != b'e' {
        let (key, after_key) = byte_string(bytes, at)?;
        let (item, end) = node(bytes, after_key, depth + 1)?;
        entries.push((key, item));
        at = end;
    }
    Some((Value::Dict(entries), at + 1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_dict_answers_for_its_keys_and_keeps_the_bytes_each_value_came_from() {
        let parsed = parse(b"d3:cow3:moo4:spaml1:ai7ee1:ii-3ee").unwrap();

        assert_eq!(parsed.get(b"cow").unwrap().bytes(), Some(&b"moo"[..]));
        assert_eq!(parsed.get(b"spam").unwrap().raw, b"l1:ai7ee");
        assert_eq!(parsed.get(b"i").unwrap().int(), Some(-3));
        assert_eq!(parsed.get(b"spam").unwrap().list().unwrap().len(), 2);
        assert_eq!(parsed.get(b"absent"), None);
    }

    #[test]
    fn what_follows_the_first_value_is_ignored() {
        assert_eq!(parse(b"i1eTRAILING").unwrap().int(), Some(1));
    }

    #[test]
    fn a_length_past_the_end_of_the_input_is_refused() {
        assert_eq!(parse(b"99:short"), None);
        assert_eq!(parse(b"99999999999999999999:short"), None);
    }

    #[test]
    fn anything_cut_short_is_refused() {
        for malformed in [
            &b""[..],
            b"d",
            b"l",
            b"i12",
            b"d3:cow",
            b"d3:cowe",
            b"<html>",
        ] {
            assert_eq!(parse(malformed), None, "{malformed:?}");
        }
    }

    #[test]
    fn nesting_deep_enough_to_overflow_the_stack_is_refused() {
        let hostile = vec![b'l'; 1_000_000];

        assert_eq!(parse(&hostile), None);
    }
}
