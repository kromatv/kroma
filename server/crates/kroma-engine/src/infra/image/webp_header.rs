//! The width a WebP file states in its own header (RFC 9649 §2.5 to §2.7),
//! read without starting a process.

use std::io::Read;
use std::path::Path;

const HEADER: usize = 30;
const VP8_START_CODE: [u8; 3] = [0x9d, 0x01, 0x2a];
const VP8L_SIGNATURE: u8 = 0x2f;
const FOURTEEN_BITS: u32 = 0x3fff;

pub(super) fn width_of(path: &Path) -> Option<u32> {
    let mut header = [0u8; HEADER];
    std::fs::File::open(path)
        .ok()?
        .read_exact(&mut header)
        .ok()?;
    width(&header)
}

fn width(header: &[u8; HEADER]) -> Option<u32> {
    if &header[0..4] != b"RIFF" || &header[8..12] != b"WEBP" {
        return None;
    }
    let payload = &header[20..];
    match &header[12..16] {
        b"VP8 " => lossy(payload),
        b"VP8L" => lossless(payload),
        b"VP8X" => extended(payload),
        _ => None,
    }
}

fn lossy(payload: &[u8]) -> Option<u32> {
    (payload[3..6] == VP8_START_CODE)
        .then(|| u32::from(u16::from_le_bytes([payload[6], payload[7]])) & FOURTEEN_BITS)
}

fn lossless(payload: &[u8]) -> Option<u32> {
    let bits = u32::from_le_bytes([payload[1], payload[2], payload[3], payload[4]]);
    (payload[0] == VP8L_SIGNATURE).then(|| (bits & FOURTEEN_BITS) + 1)
}

fn extended(payload: &[u8]) -> Option<u32> {
    Some(u32::from_le_bytes([payload[4], payload[5], payload[6], 0]) + 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header(hex: &str) -> [u8; HEADER] {
        let bytes: Vec<u8> = (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
            .collect();
        bytes.try_into().unwrap()
    }

    #[test]
    fn a_lossy_file_states_its_width_after_the_start_code() {
        let poster = header("52494646fa0200005745425056503820ee0200005054009d012af401ee02");

        assert_eq!(width(&poster), Some(500));
    }

    #[test]
    fn a_lossy_width_keeps_fourteen_bits_and_drops_the_scale() {
        let widest = header("52494646080200005745425056503820fc010000503a009d012aff3f0200");

        assert_eq!(width(&widest), Some(16383));
    }

    #[test]
    fn a_lossless_file_states_its_width_less_one() {
        let logo = header("5249464626000000574542505650384c1a0000002f400104000750815408");

        assert_eq!(width(&logo), Some(321));
    }

    #[test]
    fn an_extended_file_states_its_canvas_width_less_one() {
        let backdrop = header("52494646f006000057454250565038580a00000010000000ff0400cf0200");

        assert_eq!(width(&backdrop), Some(1280));
    }

    #[test]
    fn a_file_that_is_not_webp_has_no_width_here() {
        let mut png = [0u8; HEADER];
        png[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");

        assert_eq!(width(&png), None);
    }

    #[test]
    fn a_lossy_chunk_without_its_start_code_has_no_width() {
        let broken = header("52494646fa0200005745425056503820ee020000505400000000f401ee02");

        assert_eq!(width(&broken), None);
    }

    #[test]
    fn a_file_shorter_than_the_header_has_no_width() {
        let dir = kroma_testing::temp_dir("webp-header");
        let path = dir.path().join("short.webp");
        std::fs::write(&path, b"RIFF\x00\x00\x00\x00WEBP").unwrap();

        assert_eq!(width_of(&path), None);
    }
}
