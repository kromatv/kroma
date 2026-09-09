use kroma_db::DeviceHints;
use serde::Serialize;

/// Devices seen recently, counted by the kind of thing they are. The three
/// kinds are the ones a User-Agent can actually tell apart, and they are spelled
/// as the account's device list spells them.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct Clients {
    pub tv: u32,
    pub mobile: u32,
    pub desktop: u32,
}

// Above this a count says more about the install than about the fleet, and one
// unusual number is enough to pick a row out of a crowd.
const CEILING: u32 = 50;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Tv,
    Mobile,
    Desktop,
}

/// Which kind of device sent this User-Agent. Mirrors `deviceInfo` in the web
/// client, which names the same three kinds from the same tokens.
pub fn kind(user_agent: &str) -> Kind {
    let ua = user_agent.to_ascii_lowercase();
    const TV: &[&str] = &["tizen", "web0s", "webos", "smart-tv", "crkey", "tv"];
    const MOBILE: &[&str] = &["mobi", "iphone", "ipad", "ipod", "android"];
    if TV.iter().any(|t| ua.contains(t)) {
        return Kind::Tv;
    }
    if MOBILE.iter().any(|t| ua.contains(t)) {
        return Kind::Mobile;
    }
    Kind::Desktop
}

/// Count one device per live credential. A credential with no User-Agent is
/// counted as a desktop, the same fallback the account list uses.
pub fn tally(devices: &[DeviceHints]) -> Clients {
    let mut out = Clients::default();
    for device in devices {
        match kind(device.user_agent.as_deref().unwrap_or("")) {
            Kind::Tv => out.tv += 1,
            Kind::Mobile => out.mobile += 1,
            Kind::Desktop => out.desktop += 1,
        }
    }
    out.tv = out.tv.min(CEILING);
    out.mobile = out.mobile.min(CEILING);
    out.desktop = out.desktop.min(CEILING);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_television_is_named_by_its_platform_however_it_spells_it() {
        assert_eq!(kind("Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0)"), Kind::Tv);
        assert_eq!(kind("Mozilla/5.0 (Web0S; Linux/SmartTV)"), Kind::Tv);
        assert_eq!(kind("Kroma/1.0 (Apple TV; tvOS 26.0)"), Kind::Tv);
        assert_eq!(kind("Kroma/1.0 (Chromecast; Android TV 14)"), Kind::Tv);
    }

    #[test]
    fn a_phone_or_a_tablet_is_mobile_and_a_browser_is_a_desktop() {
        assert_eq!(kind("Kroma/1.0 (iPhone 17 Pro; iOS 26.0)"), Kind::Mobile);
        assert_eq!(kind("Mozilla/5.0 (Linux; Android 15) Mobile"), Kind::Mobile);
        assert_eq!(kind("Mozilla/5.0 (iPad; CPU OS 26_0)"), Kind::Mobile);
        assert_eq!(kind("Mozilla/5.0 (Macintosh) Safari/605"), Kind::Desktop);
        assert_eq!(
            kind("Mozilla/5.0 (Windows NT 10.0) Chrome/141"),
            Kind::Desktop
        );
    }

    fn seen(user_agent: Option<&str>) -> DeviceHints {
        DeviceHints {
            user_agent: user_agent.map(str::to_string),
            language: None,
        }
    }

    #[test]
    fn a_credential_that_never_sent_a_user_agent_still_counts_as_a_device() {
        assert_eq!(kind(""), Kind::Desktop);
        assert_eq!(
            tally(&[seen(None), seen(Some("Mozilla/5.0 (Web0S)"))]),
            Clients {
                tv: 1,
                mobile: 0,
                desktop: 1
            }
        );
    }

    #[test]
    fn a_fleet_larger_than_the_ceiling_is_reported_at_the_ceiling() {
        let phones: Vec<DeviceHints> = (0..CEILING + 7)
            .map(|_| seen(Some("Kroma/1.0 (iPhone; iOS 26.0)")))
            .collect();

        assert_eq!(tally(&phones).mobile, CEILING);
    }
}
