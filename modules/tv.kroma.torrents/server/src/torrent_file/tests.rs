use super::*;

fn bstr(value: &str) -> String {
    format!("{}:{value}", value.len())
}

fn sample() -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(
        format!(
            "d{}{}{}d{}i1024e{}{}{}i16384e{}20:",
            bstr("announce"),
            bstr(TRACKER),
            bstr("info"),
            bstr("length"),
            bstr("name"),
            bstr(NAME),
            bstr("piece length"),
            bstr("pieces"),
        )
        .as_bytes(),
    );
    out.extend_from_slice(&[0u8; 20]);
    out.extend_from_slice(b"ee");
    out
}

const TRACKER: &str = "http://tracker.test/announce";
const NAME: &str = "Dune.2021.mkv";

#[test]
fn a_torrent_file_yields_its_hash_name_size_and_a_magnet_standing_for_it() {
    let parsed = parse(&sample()).unwrap();

    assert_eq!(parsed.name, NAME);
    assert_eq!(parsed.size_bytes, 1024);
    assert_eq!(parsed.trackers, [TRACKER]);
    assert_eq!(parsed.info_hash.len(), 40);
    assert!(parsed.magnet.starts_with(&format!(
        "magnet:?xt=urn:btih:{}&dn=Dune.2021.mkv&tr=http%3A%2F%2F",
        parsed.info_hash
    )));
}

#[test]
fn anything_that_is_not_a_torrent_is_refused_rather_than_guessed_at() {
    assert!(parse(b"").unwrap_err().to_string().contains("empty"));
    assert!(parse(b"<html>nope</html>").is_err());
}

fn multi_file(files: &str) -> Vec<u8> {
    format!("d4:infod5:files{files}4:name4:Pack12:piece lengthi16384e6:pieces0:ee").into_bytes()
}

#[test]
fn a_pack_sizes_up_as_all_of_its_files_under_the_hash_of_its_info_dict() {
    let bytes = multi_file("ld6:lengthi4e4:pathl1:aeed6:lengthi6e4:pathl3:sub1:beee");

    let parsed = parse(&bytes).unwrap();

    let info = bencode::parse(&bytes).unwrap();
    assert_eq!(parsed.name, "Pack");
    assert_eq!(parsed.size_bytes, 10);
    assert_eq!(parsed.info_hash, sha1_hex(info.get(b"info").unwrap().raw));
}

#[test]
fn a_hash_is_taken_over_the_info_dict_exactly_as_it_was_written() {
    let parsed = parse(&sample()).unwrap();

    assert_eq!(parsed.info_hash, "edac6e6226fb72e67c3fe7eb1b5208706791cc21");
}

#[test]
fn the_announce_list_wins_over_the_single_announce() {
    let bytes = b"d8:announce4:one113:announce-listll4:two1el4:two2ee4:infod6:lengthi1e4:name1:a12:piece lengthi1e6:pieces0:ee";

    assert_eq!(parse(bytes).unwrap().trackers, ["two1", "two2"]);
}

#[test]
fn a_torrent_that_could_not_be_written_safely_is_refused() {
    for refused in [
        "le",
        "ld6:lengthi1e4:pathl2:..eee",
        "ld6:lengthi1e4:pathl3:a/beee",
        "ld6:lengthi1e4:pathl3:a\\beee",
        "ld6:lengthi1e4:pathleee",
        "ld6:lengthi1e4:pathl1:aeed6:lengthi1e4:pathl1:aeee",
        "ld6:lengthi0e4:pathl1:aeee",
        "ld6:lengthi-1e4:pathl1:aeee",
    ] {
        assert!(parse(&multi_file(refused)).is_err(), "{refused}");
    }
}

#[test]
fn two_padding_files_may_share_a_path() {
    let bytes = multi_file(
        "ld4:attr1:p6:lengthi1e4:pathl4:.pad1:1eed4:attr1:p6:lengthi1e4:pathl4:.pad1:1eed6:lengthi1e4:pathl1:aeee",
    );

    assert_eq!(parse(&bytes).unwrap().size_bytes, 3);
}

#[test]
fn stored_bytes_come_back_by_hash_and_a_miss_is_not_an_error() {
    let dir = kroma_module_sdk::testing::temp_dir("torrent-upload");

    store(dir.path(), "abc123", b"payload").unwrap();

    assert_eq!(
        stored_bytes(dir.path(), Some("abc123")).as_deref(),
        Some(&b"payload"[..])
    );
    assert_eq!(stored_bytes(dir.path(), Some("missing")), None);
    assert_eq!(stored_bytes(dir.path(), None), None);
}
