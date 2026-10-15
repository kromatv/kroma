use std::ops::Range;

/// Where a container keeps the index a player has to read before the picture.
#[derive(Debug, PartialEq, Eq)]
pub enum ContainerIndex {
    Ahead,
    Behind(Range<u64>),
    Unknown,
}

struct Atom {
    kind: [u8; 4],
    end: Option<u64>,
}

pub fn container_index(head: &[u8], len: u64) -> ContainerIndex {
    let mut at = 0;
    while let Some(atom) = atom_at(head, at) {
        match &atom.kind {
            b"moov" => return ContainerIndex::Ahead,
            b"mdat" => {
                return match atom.end.filter(|end| *end < len) {
                    Some(end) => ContainerIndex::Behind(end..len),
                    None => ContainerIndex::Unknown,
                }
            }
            _ => {}
        }
        match atom.end {
            Some(end) if end > at => at = end,
            _ => break,
        }
    }
    ContainerIndex::Unknown
}

fn atom_at(head: &[u8], at: u64) -> Option<Atom> {
    let from = usize::try_from(at).ok()?;
    let header = head.get(from..from.checked_add(8)?)?;
    let kind: [u8; 4] = header[4..8].try_into().ok()?;
    let (size, header_len) = match u32::from_be_bytes(header[..4].try_into().ok()?) {
        0 => (None, 8),
        1 => {
            let wide = head.get(from + 8..from + 16)?;
            (Some(u64::from_be_bytes(wide.try_into().ok()?)), 16)
        }
        declared => (Some(u64::from(declared)), 8),
    };
    let end = match size {
        None => None,
        Some(size) if size >= header_len => Some(at.checked_add(size)?),
        Some(_) => return None,
    };
    Some(Atom { kind, end })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn atom(kind: &[u8; 4], size: u32) -> Vec<u8> {
        let mut out = size.to_be_bytes().to_vec();
        out.extend_from_slice(kind);
        out
    }

    fn wide_mdat(size: u64) -> Vec<u8> {
        let mut out = 1u32.to_be_bytes().to_vec();
        out.extend_from_slice(b"mdat");
        out.extend_from_slice(&size.to_be_bytes());
        out
    }

    #[test]
    fn a_release_keeps_its_index_behind_the_picture_and_the_mdat_says_where() {
        let mut head = atom(b"ftyp", 32);
        head.resize(32, 0);
        head.extend(atom(b"mdat", 1000));

        let index = container_index(&head, 1200);

        assert_eq!(index, ContainerIndex::Behind(1032..1200));
    }

    #[test]
    fn a_remux_keeps_its_index_in_front_and_asks_for_nothing_out_of_order() {
        let mut head = atom(b"ftyp", 24);
        head.resize(24, 0);
        head.extend(atom(b"moov", 400));

        let index = container_index(&head, 100_000);

        assert_eq!(index, ContainerIndex::Ahead);
    }

    #[test]
    fn a_picture_too_big_for_a_thirty_two_bit_length_is_walked_past_by_its_wide_size() {
        let mut head = atom(b"ftyp", 8);
        head.extend(wide_mdat(8_000_000_016));

        let index = container_index(&head, 8_000_001_000);

        assert_eq!(index, ContainerIndex::Behind(8_000_000_024..8_000_001_000));
    }

    #[test]
    fn a_container_that_is_not_a_box_chain_is_left_to_the_guess() {
        let matroska = [0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x86, 0x81, 0x01];

        let index = container_index(&matroska, 100_000);

        assert_eq!(index, ContainerIndex::Unknown);
    }

    #[test]
    fn a_chain_that_runs_past_the_bytes_on_hand_is_left_to_the_guess() {
        let mut head = atom(b"ftyp", 24);
        head.resize(24, 0);
        head.extend(atom(b"free", 900_000));

        let index = container_index(&head, 100_000_000);

        assert_eq!(index, ContainerIndex::Unknown);
    }

    #[test]
    fn a_picture_running_to_the_end_of_the_file_leaves_no_index_behind_it() {
        let mut head = atom(b"ftyp", 8);
        head.extend(atom(b"mdat", 0));

        let index = container_index(&head, 100_000);

        assert_eq!(index, ContainerIndex::Unknown);
    }

    #[test]
    fn a_picture_whose_length_overruns_the_file_is_left_to_the_guess() {
        let mut head = atom(b"ftyp", 8);
        head.extend(atom(b"mdat", 500_000));

        let index = container_index(&head, 100_000);

        assert_eq!(index, ContainerIndex::Unknown);
    }

    #[test]
    fn a_length_smaller_than_the_header_it_sits_in_stops_the_walk() {
        let head = atom(b"mdat", 4);

        let index = container_index(&head, 100_000);

        assert_eq!(index, ContainerIndex::Unknown);
    }
}
