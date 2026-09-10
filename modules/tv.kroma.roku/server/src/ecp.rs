//! Roku's External Control Protocol on port 8060: who a box is, and launching
//! the sideloaded channel with the server it should talk to.

use anyhow::{bail, Result};
use serde::Serialize;

use kroma_module_sdk::http::Fetch;

use crate::address::DeviceAddress;

const ECP_PORT: u16 = 8060;
const TIMEOUT_SECS: u32 = 5;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub serial: String,
    pub name: String,
    pub model: String,
    pub software_version: String,
    pub developer_enabled: bool,
}

fn ecp() -> Fetch {
    Fetch::new().max_time(TIMEOUT_SECS)
}

pub fn device_info(address: DeviceAddress) -> Result<DeviceInfo> {
    let base = address.url(ECP_PORT);
    let reply = ecp().get(&format!("{base}/query/device-info"))?;
    if reply.status != 200 {
        bail!("device-info answered {}", reply.status);
    }
    Ok(parse_device_info(&reply.text()))
}

pub fn launch_dev(address: DeviceAddress, server_url: &str) -> Result<()> {
    let base = address.url(ECP_PORT);
    let url = format!("{base}/launch/dev?server={}", encode(server_url));
    let reply = ecp().post_form(&url, &[])?;
    if !(200..300).contains(&reply.status) {
        bail!("launch answered {}", reply.status);
    }
    Ok(())
}

pub fn parse_device_info(xml: &str) -> DeviceInfo {
    let text = |tag: &str| tag_text(xml, tag).unwrap_or_default();
    let name = tag_text(xml, "user-device-name")
        .or_else(|| tag_text(xml, "friendly-device-name"))
        .unwrap_or_default();
    DeviceInfo {
        serial: text("serial-number"),
        name,
        model: text("model-name"),
        software_version: text("software-version"),
        developer_enabled: text("developer-enabled") == "true",
    }
}

fn tag_text(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    let raw = xml[start..end].trim();
    (!raw.is_empty()).then(|| unescape(raw))
}

fn unescape(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

pub fn encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const XML: &str = r#"<?xml version="1.0" encoding="UTF-8" ?>
<device-info>
  <serial-number>YH00AB123456</serial-number>
  <model-name>Roku Ultra</model-name>
  <friendly-device-name>Roku Ultra</friendly-device-name>
  <user-device-name>Salon &amp; TV</user-device-name>
  <software-version>13.1.4</software-version>
  <developer-enabled>true</developer-enabled>
</device-info>"#;

    #[test]
    fn the_fields_the_console_shows_are_read_off_device_info() {
        let info = parse_device_info(XML);

        assert_eq!(
            info,
            DeviceInfo {
                serial: "YH00AB123456".into(),
                name: "Salon & TV".into(),
                model: "Roku Ultra".into(),
                software_version: "13.1.4".into(),
                developer_enabled: true,
            }
        );
    }

    #[test]
    fn a_box_with_no_user_name_falls_back_to_the_friendly_one() {
        let xml = XML.replace("<user-device-name>Salon &amp; TV</user-device-name>", "");

        assert_eq!(parse_device_info(&xml).name, "Roku Ultra");
    }

    #[test]
    fn developer_mode_is_off_unless_the_box_says_true() {
        let xml = XML.replace("<developer-enabled>true", "<developer-enabled>false");

        assert!(!parse_device_info(&xml).developer_enabled);
        assert!(!parse_device_info("<device-info/>").developer_enabled);
    }

    #[test]
    fn the_server_url_survives_the_launch_query_string() {
        assert_eq!(
            encode("http://192.168.1.20:4040"),
            "http%3A%2F%2F192.168.1.20%3A4040"
        );
    }
}
