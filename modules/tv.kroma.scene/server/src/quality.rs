use serde::{Deserialize, Serialize};

use crate::{Res, Source};

/// The fixed quality vocabulary: a source at a resolution. Fixed so two
/// profiles rank the same names; what a profile chooses is their order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Quality {
    #[serde(rename = "unknown")]
    Unknown,
    #[serde(rename = "cam")]
    Cam,
    #[serde(rename = "unknown-sd")]
    UnknownSd,
    #[serde(rename = "sdtv")]
    Sdtv,
    #[serde(rename = "webrip-sd")]
    WebRipSd,
    #[serde(rename = "webdl-sd")]
    WebDlSd,
    #[serde(rename = "dvd")]
    Dvd,
    #[serde(rename = "bluray-sd")]
    BluraySd,
    #[serde(rename = "unknown-720p")]
    Unknown720,
    #[serde(rename = "hdtv-720p")]
    Hdtv720,
    #[serde(rename = "webrip-720p")]
    WebRip720,
    #[serde(rename = "webdl-720p")]
    WebDl720,
    #[serde(rename = "bluray-720p")]
    Bluray720,
    #[serde(rename = "unknown-1080p")]
    Unknown1080,
    #[serde(rename = "hdtv-1080p")]
    Hdtv1080,
    #[serde(rename = "webrip-1080p")]
    WebRip1080,
    #[serde(rename = "webdl-1080p")]
    WebDl1080,
    #[serde(rename = "bluray-1080p")]
    Bluray1080,
    #[serde(rename = "remux-1080p")]
    Remux1080,
    #[serde(rename = "unknown-2160p")]
    Unknown2160,
    #[serde(rename = "hdtv-2160p")]
    Hdtv2160,
    #[serde(rename = "webrip-2160p")]
    WebRip2160,
    #[serde(rename = "webdl-2160p")]
    WebDl2160,
    #[serde(rename = "bluray-2160p")]
    Bluray2160,
    #[serde(rename = "remux-2160p")]
    Remux2160,
}

impl Quality {
    pub const ALL: [Quality; 25] = [
        Quality::Unknown,
        Quality::Cam,
        Quality::UnknownSd,
        Quality::Sdtv,
        Quality::WebRipSd,
        Quality::WebDlSd,
        Quality::Dvd,
        Quality::BluraySd,
        Quality::Unknown720,
        Quality::Hdtv720,
        Quality::WebRip720,
        Quality::WebDl720,
        Quality::Bluray720,
        Quality::Unknown1080,
        Quality::Hdtv1080,
        Quality::WebRip1080,
        Quality::WebDl1080,
        Quality::Bluray1080,
        Quality::Remux1080,
        Quality::Unknown2160,
        Quality::Hdtv2160,
        Quality::WebRip2160,
        Quality::WebDl2160,
        Quality::Bluray2160,
        Quality::Remux2160,
    ];

    /// The quality a source and a resolution make. A cam is a cam at any
    /// resolution, a DVD is always SD, and a remux below 1080p is a Blu-ray.
    pub fn of(source: Option<Source>, resolution: Option<Res>) -> Quality {
        match (source, resolution) {
            (Some(Source::Cam), _) => Quality::Cam,
            (Some(Source::Dvd), _) => Quality::Dvd,
            (None, None) => Quality::Unknown,
            (Some(Source::Remux), None) => Quality::Remux1080,
            (source, None) => Self::at(source, Res::Sd),
            (source, Some(resolution)) => Self::at(source, resolution),
        }
    }

    fn at(source: Option<Source>, resolution: Res) -> Quality {
        use Quality as Q;
        match (resolution, source) {
            (Res::Sd, None) => Q::UnknownSd,
            (Res::Sd, Some(Source::Hdtv)) => Q::Sdtv,
            (Res::Sd, Some(Source::WebRip)) => Q::WebRipSd,
            (Res::Sd, Some(Source::WebDl)) => Q::WebDlSd,
            (Res::Sd, Some(_)) => Q::BluraySd,
            (Res::R720, None) => Q::Unknown720,
            (Res::R720, Some(Source::Hdtv)) => Q::Hdtv720,
            (Res::R720, Some(Source::WebRip)) => Q::WebRip720,
            (Res::R720, Some(Source::WebDl)) => Q::WebDl720,
            (Res::R720, Some(_)) => Q::Bluray720,
            (Res::R1080, None) => Q::Unknown1080,
            (Res::R1080, Some(Source::Hdtv)) => Q::Hdtv1080,
            (Res::R1080, Some(Source::WebRip)) => Q::WebRip1080,
            (Res::R1080, Some(Source::WebDl)) => Q::WebDl1080,
            (Res::R1080, Some(Source::Remux)) => Q::Remux1080,
            (Res::R1080, Some(_)) => Q::Bluray1080,
            (Res::R2160, None) => Q::Unknown2160,
            (Res::R2160, Some(Source::Hdtv)) => Q::Hdtv2160,
            (Res::R2160, Some(Source::WebRip)) => Q::WebRip2160,
            (Res::R2160, Some(Source::WebDl)) => Q::WebDl2160,
            (Res::R2160, Some(Source::Remux)) => Q::Remux2160,
            (Res::R2160, Some(_)) => Q::Bluray2160,
        }
    }

    pub fn resolution(self) -> Option<Res> {
        use Quality as Q;
        match self {
            Q::Unknown | Q::Cam => None,
            Q::UnknownSd | Q::Sdtv | Q::WebRipSd | Q::WebDlSd | Q::Dvd | Q::BluraySd => {
                Some(Res::Sd)
            }
            Q::Unknown720 | Q::Hdtv720 | Q::WebRip720 | Q::WebDl720 | Q::Bluray720 => {
                Some(Res::R720)
            }
            Q::Unknown1080
            | Q::Hdtv1080
            | Q::WebRip1080
            | Q::WebDl1080
            | Q::Bluray1080
            | Q::Remux1080 => Some(Res::R1080),
            Q::Unknown2160
            | Q::Hdtv2160
            | Q::WebRip2160
            | Q::WebDl2160
            | Q::Bluray2160
            | Q::Remux2160 => Some(Res::R2160),
        }
    }

    /// The spelling the wire and the profile editor use (`webdl-1080p`).
    pub fn id(self) -> &'static str {
        use Quality as Q;
        match self {
            Q::Unknown => "unknown",
            Q::Cam => "cam",
            Q::UnknownSd => "unknown-sd",
            Q::Sdtv => "sdtv",
            Q::WebRipSd => "webrip-sd",
            Q::WebDlSd => "webdl-sd",
            Q::Dvd => "dvd",
            Q::BluraySd => "bluray-sd",
            Q::Unknown720 => "unknown-720p",
            Q::Hdtv720 => "hdtv-720p",
            Q::WebRip720 => "webrip-720p",
            Q::WebDl720 => "webdl-720p",
            Q::Bluray720 => "bluray-720p",
            Q::Unknown1080 => "unknown-1080p",
            Q::Hdtv1080 => "hdtv-1080p",
            Q::WebRip1080 => "webrip-1080p",
            Q::WebDl1080 => "webdl-1080p",
            Q::Bluray1080 => "bluray-1080p",
            Q::Remux1080 => "remux-1080p",
            Q::Unknown2160 => "unknown-2160p",
            Q::Hdtv2160 => "hdtv-2160p",
            Q::WebRip2160 => "webrip-2160p",
            Q::WebDl2160 => "webdl-2160p",
            Q::Bluray2160 => "bluray-2160p",
            Q::Remux2160 => "remux-2160p",
        }
    }
}

impl Res {
    /// The tier a decoded picture of `width` x `height` belongs to. Width
    /// decides first, so a 1920x800 scope film is 1080p.
    pub fn from_dimensions(width: Option<u32>, height: Option<u32>) -> Option<Res> {
        let (w, h) = (width.unwrap_or(0), height.unwrap_or(0));
        if w == 0 && h == 0 {
            return None;
        }
        Some(match (w, h) {
            (3200.., _) | (_, 2000..) => Res::R2160,
            (1800.., _) | (_, 1000..) => Res::R1080,
            (1200.., _) | (_, 700..) => Res::R720,
            _ => Res::Sd,
        })
    }
}
