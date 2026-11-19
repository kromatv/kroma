//! Bringing back a television that is off: what it said about itself while it
//! was on, and the steps that reach it again. The steps are data, so whoever
//! sits on the television's network runs them: the server, or the caller.

use std::net::Ipv4Addr;

use serde::{Deserialize, Serialize};

const MAX_APP_ID: usize = 128;

/// What a receiver reports about reaching itself, exactly as it wrote it.
/// Nothing in it is used before [`CastWakeHint::checked`].
#[derive(Debug, Clone, Default, Deserialize)]
pub struct CastWakeHint {
    #[serde(default)]
    pub mac: Option<String>,
    #[serde(default)]
    pub address: Option<String>,
    #[serde(rename = "appId", default)]
    pub app_id: Option<String>,
}

/// A hint with every field checked: a real hardware address, a private IPv4,
/// an app id that is safe inside a URL. A field that fails is dropped alone.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CastWakeTarget {
    pub mac: Option<String>,
    pub address: Option<Ipv4Addr>,
    pub app_id: Option<String>,
}

impl CastWakeHint {
    pub fn checked(&self) -> CastWakeTarget {
        CastWakeTarget {
            mac: self.mac.as_deref().and_then(parse_mac).map(format_mac),
            address: self.address.as_deref().and_then(private_ipv4),
            app_id: self.app_id.as_deref().and_then(app_id),
        }
    }
}

/// One thing to do to bring a television back, in the order given.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CastWakeStep {
    /// A Wake-on-LAN packet for this hardware address, broadcast on the link.
    Magic { mac: String },
    /// A Samsung set: power it on over its own remote service when it is in
    /// standby, by the packet when it does not answer at all, then ask it to
    /// open the app.
    Samsung {
        address: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        mac: Option<String>,
        #[serde(rename = "appId")]
        app_id: String,
    },
}

struct Driver {
    platform: &'static str,
    plan: fn(&CastWakeTarget) -> Option<CastWakeStep>,
}

// One row per platform that is brought back by more than the packet. A platform
// with no row, or one that did not say enough for its row, gets the packet and
// shows whatever it shows after power-on.
const DRIVERS: &[Driver] = &[Driver {
    platform: "tizen",
    plan: samsung,
}];

fn samsung(target: &CastWakeTarget) -> Option<CastWakeStep> {
    Some(CastWakeStep::Samsung {
        address: target.address?.to_string(),
        mac: target.mac.clone(),
        app_id: target.app_id.clone()?,
    })
}

/// The steps that bring `platform`'s television back. Empty when the television
/// gave nothing to reach it by.
pub fn wake_plan(platform: &str, target: &CastWakeTarget) -> Vec<CastWakeStep> {
    let driven = DRIVERS
        .iter()
        .find(|d| d.platform.eq_ignore_ascii_case(platform))
        .and_then(|driver| (driver.plan)(target));
    let packet = || {
        target
            .mac
            .as_ref()
            .map(|mac| CastWakeStep::Magic { mac: mac.clone() })
    };
    driven.or_else(packet).into_iter().collect()
}

/// The six bytes of a hardware address written with `:`, `-` or no separator.
/// The all-zero and broadcast addresses name no device and are refused.
pub fn parse_mac(text: &str) -> Option<[u8; 6]> {
    let hex: String = text
        .chars()
        .filter(|c| !matches!(c, ':' | '-'))
        .collect();
    if hex.len() != 12 || !hex.is_ascii() {
        return None;
    }
    let mut mac = [0u8; 6];
    for (i, byte) in mac.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).ok()?;
    }
    let names_nobody = mac == [0; 6] || mac == [0xff; 6];
    (!names_nobody).then_some(mac)
}

fn format_mac(mac: [u8; 6]) -> String {
    mac.map(|byte| format!("{byte:02x}")).join(":")
}

fn private_ipv4(text: &str) -> Option<Ipv4Addr> {
    text.parse::<Ipv4Addr>().ok().filter(Ipv4Addr::is_private)
}

fn app_id(text: &str) -> Option<String> {
    let safe = !text.is_empty()
        && text.len() <= MAX_APP_ID
        && text
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'));
    safe.then(|| text.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hint(mac: &str, address: &str, app_id: &str) -> CastWakeHint {
        CastWakeHint {
            mac: Some(mac.into()),
            address: Some(address.into()),
            app_id: Some(app_id.into()),
        }
    }

    #[test]
    fn a_hardware_address_is_read_in_every_common_spelling() {
        let expected = Some([0xa0, 0xb1, 0xc2, 0xd3, 0xe4, 0xf5]);

        assert_eq!(parse_mac("a0:b1:c2:d3:e4:f5"), expected);
        assert_eq!(parse_mac("A0-B1-C2-D3-E4-F5"), expected);
        assert_eq!(parse_mac("a0b1c2d3e4f5"), expected);
    }

    #[test]
    fn an_address_that_names_no_device_is_refused() {
        assert_eq!(parse_mac("00:00:00:00:00:00"), None);
        assert_eq!(parse_mac("ff:ff:ff:ff:ff:ff"), None);
        assert_eq!(parse_mac("a0:b1:c2"), None);
        assert_eq!(parse_mac("zz:b1:c2:d3:e4:f5"), None);
        assert_eq!(parse_mac("é0b1c2d3e4f"), None);
    }

    #[test]
    fn a_checked_hint_keeps_what_is_sound_and_normalises_it() {
        let target = hint("A0-B1-C2-D3-E4-F5", "192.168.1.20", "KromaTV001.Kroma").checked();

        assert_eq!(target.mac.as_deref(), Some("a0:b1:c2:d3:e4:f5"));
        assert_eq!(target.address, Some(Ipv4Addr::new(192, 168, 1, 20)));
        assert_eq!(target.app_id.as_deref(), Some("KromaTV001.Kroma"));
    }

    #[test]
    fn a_public_address_or_a_path_in_the_app_id_is_dropped_alone() {
        let target = hint("a0:b1:c2:d3:e4:f5", "8.8.8.8", "../admin?x=1").checked();

        assert_eq!(target.mac.as_deref(), Some("a0:b1:c2:d3:e4:f5"));
        assert_eq!(target.address, None);
        assert_eq!(target.app_id, None);
    }

    #[test]
    fn a_samsung_set_gets_its_own_step_with_everything_it_said() {
        let target = hint("a0:b1:c2:d3:e4:f5", "192.168.1.20", "KromaTV001.Kroma").checked();

        let plan = wake_plan("Tizen", &target);

        assert_eq!(
            plan,
            vec![CastWakeStep::Samsung {
                address: "192.168.1.20".into(),
                mac: Some("a0:b1:c2:d3:e4:f5".into()),
                app_id: "KromaTV001.Kroma".into(),
            }]
        );
    }

    #[test]
    fn a_platform_with_no_launcher_is_only_powered_on() {
        let target = hint("a0:b1:c2:d3:e4:f5", "192.168.1.20", "tv.kroma.app").checked();

        let plan = wake_plan("webOS", &target);

        assert_eq!(
            plan,
            vec![CastWakeStep::Magic {
                mac: "a0:b1:c2:d3:e4:f5".into()
            }]
        );
    }

    #[test]
    fn a_television_that_said_nothing_has_no_plan() {
        assert!(wake_plan("Tizen", &CastWakeTarget::default()).is_empty());
    }

    #[test]
    fn a_step_travels_tagged_by_its_type() {
        let step = CastWakeStep::Magic {
            mac: "a0:b1:c2:d3:e4:f5".into(),
        };

        let json = serde_json::to_value(&step).unwrap();

        assert_eq!(
            json,
            serde_json::json!({ "type": "magic", "mac": "a0:b1:c2:d3:e4:f5" })
        );
    }

    #[test]
    fn a_samsung_set_that_named_no_app_falls_back_to_the_packet() {
        let target = CastWakeTarget {
            mac: Some("a0:b1:c2:d3:e4:f5".into()),
            address: Some(Ipv4Addr::new(192, 168, 1, 20)),
            app_id: None,
        };

        let plan = wake_plan("Tizen", &target);

        assert_eq!(
            plan,
            vec![CastWakeStep::Magic {
                mac: "a0:b1:c2:d3:e4:f5".into()
            }]
        );
    }

    #[test]
    fn a_samsung_step_travels_without_a_hardware_address_it_never_had() {
        let step = CastWakeStep::Samsung {
            address: "192.168.1.20".into(),
            mac: None,
            app_id: "KromaTV001.Kroma".into(),
        };

        let json = serde_json::to_value(&step).unwrap();

        assert_eq!(
            json,
            serde_json::json!({ "type": "samsung", "address": "192.168.1.20", "appId": "KromaTV001.Kroma" })
        );
    }
}
