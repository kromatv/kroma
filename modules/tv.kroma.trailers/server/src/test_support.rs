use std::collections::{HashMap, VecDeque};
use std::path::Path;
use std::sync::Mutex;

use anyhow::{anyhow, Result};
use serde_json::{json, Value};

use crate::profiles::Client;
use crate::web::Web;

pub(crate) fn client(name: &str) -> Client {
    let mut context = std::collections::BTreeMap::new();
    context.insert("deviceMake".to_string(), "Apple".to_string());
    Client {
        name: name.to_string(),
        client_name: "VISIONOS".to_string(),
        client_name_id: 101,
        client_version: "1.02".to_string(),
        user_agent: "Mozilla/5.0".to_string(),
        context,
    }
}

pub(crate) fn player_answer(video_bytes: usize, audio_bytes: usize, length_seconds: &str) -> Value {
    json!({
        "playabilityStatus": { "status": "OK" },
        "videoDetails": { "lengthSeconds": length_seconds, "isLiveContent": false },
        "streamingData": { "adaptiveFormats": [
            {
                "itag": 137,
                "mimeType": "video/mp4; codecs=\"avc1.640028\"",
                "url": "https://rr1---sn-x.googlevideo.com/videoplayback?itag=137",
                "contentLength": video_bytes.to_string(),
                "height": 1080,
                "bitrate": 4_000_000
            },
            {
                "itag": 140,
                "mimeType": "audio/mp4; codecs=\"mp4a.40.2\"",
                "url": "https://rr1---sn-x.googlevideo.com/videoplayback?itag=140",
                "contentLength": audio_bytes.to_string(),
                "bitrate": 130_000,
                "audioTrack": { "id": "en-US.4", "displayName": "English original", "audioIsDefault": true }
            }
        ] }
    })
}

type Sent = (String, Vec<(String, String)>, Value);

pub(crate) struct Recorded {
    answers: Mutex<VecDeque<Value>>,
    sent: Mutex<Vec<Sent>>,
    files: HashMap<u32, Vec<u8>>,
    downloads: Mutex<usize>,
}

impl Recorded {
    pub(crate) fn answering(answers: Vec<Value>) -> Self {
        Self::serving(answers, Vec::new())
    }

    pub(crate) fn serving(answers: Vec<Value>, files: Vec<(u32, Vec<u8>)>) -> Self {
        Self {
            answers: Mutex::new(answers.into()),
            sent: Mutex::new(Vec::new()),
            files: files.into_iter().collect(),
            downloads: Mutex::new(0),
        }
    }

    pub(crate) fn sent(&self, index: usize) -> Sent {
        self.sent.lock().unwrap()[index].clone()
    }

    pub(crate) fn downloads(&self) -> usize {
        *self.downloads.lock().unwrap()
    }
}

fn query<'a>(url: &'a str, name: &str) -> Option<&'a str> {
    url.split(['?', '&'])
        .find_map(|pair| pair.strip_prefix(name)?.strip_prefix('='))
}

impl Web for Recorded {
    fn post_json(&self, url: &str, headers: &[(&str, String)], body: &Value) -> Result<Value> {
        let headers = headers
            .iter()
            .map(|(k, v)| (k.to_string(), v.clone()))
            .collect();
        self.sent
            .lock()
            .unwrap()
            .push((url.to_string(), headers, body.clone()));
        self.answers
            .lock()
            .unwrap()
            .pop_front()
            .ok_or_else(|| anyhow!("nothing left to answer"))
    }

    fn download(&self, url: &str, _user_agent: &str, dest: &Path) -> Result<()> {
        *self.downloads.lock().unwrap() += 1;
        let itag: u32 = query(url, "itag")
            .ok_or_else(|| anyhow!("no itag"))?
            .parse()?;
        let bytes = self
            .files
            .get(&itag)
            .ok_or_else(|| anyhow!("no file for {itag}"))?;
        let (start, end) = query(url, "range")
            .and_then(|r| r.split_once('-'))
            .ok_or_else(|| anyhow!("no range"))?;
        let (start, end): (usize, usize) = (start.parse()?, end.parse()?);
        std::fs::write(dest, &bytes[start..=end.min(bytes.len() - 1)])?;
        Ok(())
    }

    fn profiles(&self, _url: &str) -> Result<String> {
        Err(anyhow!("offline"))
    }
}
