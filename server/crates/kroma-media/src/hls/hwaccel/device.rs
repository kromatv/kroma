//! What one encoder has to say for itself.
//!
//! Everything that differs between two encoders is answered here, by the
//! encoder, in its own file under `devices/`. The command builder and the probe
//! ask these questions and never name an encoder, so supporting new hardware is
//! one implementation of [`Device`] and one place in `devices::BY_TRUST`.

use super::super::software::Effort;

/// Where the source is decoded.
pub(in super::super) enum Decode {
    /// By ffmpeg's own decoders, with the flags the effort tier asks for.
    Cpu,
    /// On the device, with these args before `-i`.
    Device(Vec<&'static str>),
}

/// Where the picture is fitted into its box.
pub(in super::super) enum Scale {
    /// In system memory, where the encoder's own `-pix_fmt` drops the depth.
    Cpu,
    /// In the device's memory, by `filter`, which hands over `format`.
    Device {
        filter: &'static str,
        format: &'static str,
    },
}

pub(in super::super) trait Device: Sync {
    /// The name in a log line, an admin field and `KROMA_HWACCEL`.
    fn label(&self) -> &'static str;

    /// The ffmpeg encoder, as `-encoders` lists it.
    fn encoder(&self) -> &'static str;

    /// The args that follow `-c:v <encoder>`.
    fn rate_control(&self, effort: Effort) -> &'static [&'static str];

    fn decode(&self) -> Decode {
        Decode::Cpu
    }

    fn scale(&self) -> Scale {
        Scale::Cpu
    }

    /// The largest picture the encoder takes, or None where no source reaches
    /// its limit.
    fn ceiling(&self) -> Option<(u32, u32)> {
        None
    }

    /// Whether this operating system can have the device at all.
    fn runs_here(&self) -> bool {
        true
    }

    /// Whether this user can open what the device lives behind. The error is
    /// the sentence an operator acts on.
    fn reachable(&self) -> Result<(), String> {
        Ok(())
    }

    /// What the test encode needs before its input.
    fn probe_input_args(&self) -> Vec<String> {
        Vec::new()
    }

    /// What the test encode needs after `-c:v <encoder>`.
    fn probe_output_args(&self) -> &'static [&'static str] {
        &[]
    }
}
