use anyhow::{anyhow, bail, Result};
use serde::Deserialize;
use serde_json::{json, Map, Value};

use crate::profiles::Client;
use crate::web::Web;

const API: &str = "https://www.youtube.com/youtubei/v1";
const ORIGIN: &str = "https://www.youtube.com";

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct Player {
    pub(crate) playability_status: Playability,
    pub(crate) streaming_data: StreamingData,
    pub(crate) video_details: VideoDetails,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct Playability {
    pub(crate) status: String,
    pub(crate) reason: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct StreamingData {
    pub(crate) adaptive_formats: Vec<Format>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct VideoDetails {
    pub(crate) length_seconds: String,
    pub(crate) is_live_content: bool,
}

#[derive(Debug, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct Format {
    pub(crate) itag: u32,
    pub(crate) mime_type: String,
    pub(crate) url: Option<String>,
    pub(crate) content_length: Option<String>,
    pub(crate) height: Option<u32>,
    pub(crate) bitrate: u64,
    pub(crate) audio_track: Option<AudioTrack>,
    pub(crate) is_drc: bool,
}

#[derive(Debug, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct AudioTrack {
    pub(crate) id: String,
    pub(crate) display_name: String,
    pub(crate) audio_is_default: bool,
    pub(crate) is_auto_dubbed: bool,
}

impl Format {
    pub(crate) fn size(&self) -> Option<u64> {
        self.content_length.as_deref()?.parse().ok()
    }
}

impl Player {
    pub(crate) fn length_seconds(&self) -> u64 {
        self.video_details.length_seconds.parse().unwrap_or(0)
    }
}

#[derive(Debug)]
pub(crate) enum Refused {
    NeedsVisitor,
    Other(String),
}

impl std::fmt::Display for Refused {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Refused::NeedsVisitor => write!(f, "YouTube asked this client to sign in"),
            Refused::Other(reason) => write!(f, "{reason}"),
        }
    }
}

impl std::error::Error for Refused {}

fn context(client: &Client) -> Value {
    let mut fields = Map::new();
    fields.insert("clientName".into(), json!(client.client_name));
    fields.insert("clientVersion".into(), json!(client.client_version));
    fields.insert("userAgent".into(), json!(client.user_agent));
    fields.insert("hl".into(), json!("en"));
    for (key, value) in &client.context {
        fields.insert(key.clone(), json!(value));
    }
    json!({ "client": Value::Object(fields) })
}

fn headers(client: &Client, visitor: Option<&str>) -> Vec<(&'static str, String)> {
    let mut out = vec![
        ("User-Agent", client.user_agent.clone()),
        ("X-YouTube-Client-Name", client.client_name_id.to_string()),
        ("X-YouTube-Client-Version", client.client_version.clone()),
        ("Origin", ORIGIN.to_string()),
    ];
    if let Some(visitor) = visitor {
        out.push(("X-Goog-Visitor-Id", visitor.to_string()));
    }
    out
}

pub(crate) fn visitor_id(web: &dyn Web, client: &Client) -> Result<String> {
    let body = json!({ "context": context(client) });
    let answer = web.post_json(
        &format!("{API}/visitor_id?prettyPrint=false"),
        &headers(client, None),
        &body,
    )?;
    answer
        .pointer("/responseContext/visitorData")
        .and_then(Value::as_str)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
        .ok_or_else(|| anyhow!("YouTube handed out no visitor id"))
}

pub(crate) fn player(web: &dyn Web, client: &Client, visitor: &str, video: &str) -> Result<Player> {
    let body = json!({
        "context": context(client),
        "videoId": video,
        "playbackContext": { "contentPlaybackContext": { "html5Preference": "HTML5_PREF_WANTS" } },
        "contentCheckOk": true,
        "racyCheckOk": true,
    });
    let answer = web.post_json(
        &format!("{API}/player?prettyPrint=false"),
        &headers(client, Some(visitor)),
        &body,
    )?;
    let player: Player = serde_json::from_value(answer)?;
    match player.playability_status.status.as_str() {
        "OK" => Ok(player),
        "LOGIN_REQUIRED" => Err(Refused::NeedsVisitor.into()),
        status => {
            let reason = player.playability_status.reason.clone().unwrap_or_default();
            bail!(Refused::Other(
                format!("{status} {reason}").trim().to_string()
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::test_support::{client, Recorded};

    #[test]
    fn the_player_call_names_the_client_the_way_youtube_reads_it() {
        let web = Recorded::answering(vec![json!({ "playabilityStatus": { "status": "OK" } })]);

        player(&web, &client("visionos"), "visitor", "abcdefghijk").unwrap();

        let (url, headers, body) = web.sent(0);
        assert_eq!(
            url,
            "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"
        );
        assert!(headers.contains(&("X-Goog-Visitor-Id".to_string(), "visitor".to_string())));
        assert_eq!(body["context"]["client"]["clientName"], "VISIONOS");
        assert_eq!(body["context"]["client"]["deviceMake"], "Apple");
        assert_eq!(body["videoId"], "abcdefghijk");
    }

    #[test]
    fn a_sign_in_wall_asks_for_a_fresh_visitor() {
        let web = Recorded::answering(vec![
            json!({ "playabilityStatus": { "status": "LOGIN_REQUIRED" } }),
        ]);

        let refused = player(&web, &client("visionos"), "visitor", "abcdefghijk").unwrap_err();

        assert!(matches!(
            refused.downcast_ref::<Refused>(),
            Some(Refused::NeedsVisitor)
        ));
    }

    #[test]
    fn the_visitor_id_is_read_from_the_response_context() {
        let web = Recorded::answering(vec![json!({ "responseContext": { "visitorData": "Cgt" } })]);

        let visitor = visitor_id(&web, &client("visionos")).unwrap();

        assert_eq!(visitor, "Cgt");
    }
}
