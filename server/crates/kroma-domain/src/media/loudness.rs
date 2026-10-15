//! The EBU R128 loudness measurement of an item's default audio track.

use serde::{Deserialize, Serialize};

/// Outcome of the EBU R128 loudness analysis of an audio track.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AudioVerdict {
    Ok,
    HighDynamics,
    QuietDialog,
}

/// EBU R128 loudness measurement of an item's default audio track, produced by
/// the `pipeline.loudness` stage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioAnalysis {
    #[serde(rename = "lufsI")]
    pub lufs_i: f64,
    // Loudness range (LU); > ~15 is the classic "quiet dialogue, loud
    // explosions" mix.
    pub lra: f64,
    #[serde(rename = "truePeak")]
    pub true_peak: f64,
    // Centre-channel loudness (LUFS), measured for 5.1+ tracks only.
    #[serde(
        rename = "dialogLufs",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub dialog_lufs: Option<f64>,
    pub verdict: AudioVerdict,
}
