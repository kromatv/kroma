mod support;

use std::sync::{Arc, Mutex};

use kroma_wasm_host::{AudioDecode, Media, SampleFormat};
use support::{probe, sandboxed, text, with_media};

const SOURCE: &str = "/library/film.mkv";

#[derive(Default)]
struct Recorded {
    asked: Mutex<Vec<AudioDecode>>,
}

impl Media for Recorded {
    fn decode_audio(&self, request: AudioDecode) -> Result<u64, String> {
        let refused = request.source != SOURCE;
        self.asked.lock().unwrap().push(request);
        if refused {
            return Err("not in a folder this module holds".into());
        }
        Ok(32_000)
    }
}

#[test]
fn a_decode_reaches_the_host_as_the_component_asked_and_answers_its_size() {
    let media = Arc::new(Recorded::default());
    let mut module = with_media(media.clone());

    let response = probe(&mut module, "/media/decode", SOURCE);

    let asked = media.asked.lock().unwrap();
    assert_eq!(
        (response.status, text(&response).as_str()),
        (200, "decoded 32000 bytes")
    );
    assert_eq!(
        (
            asked[0].source.as_str(),
            asked[0].track,
            asked[0].sample_rate,
            asked[0].channels
        ),
        (SOURCE, 2, 16_000, 1)
    );
    assert_eq!(asked[0].format, SampleFormat::S16le);
    assert_eq!(asked[0].destination, "/tmp/pcm");
}

#[test]
fn a_decode_the_host_refuses_fails_inside_the_component_with_its_reason() {
    let mut module = with_media(Arc::new(Recorded::default()));

    let response = probe(&mut module, "/media/decode", "/etc/passwd");

    assert_eq!(
        (response.status, text(&response).as_str()),
        (403, "not in a folder this module holds")
    );
}

#[test]
fn a_module_granted_no_media_tools_decodes_nothing() {
    let mut module = sandboxed();

    let response = probe(&mut module, "/media/decode", SOURCE);

    assert_eq!(response.status, 403);
    assert!(
        text(&response).contains("does not declare media"),
        "{}",
        text(&response)
    );
}
