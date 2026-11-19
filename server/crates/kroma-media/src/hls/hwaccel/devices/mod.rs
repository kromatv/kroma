//! Every encoder KROMA knows, one file each.

mod nvenc;
mod qsv;
mod software;
mod v4l2m2m;
mod vaapi;
mod videotoolbox;

use super::HwAccel;

pub const VIDEOTOOLBOX: HwAccel = HwAccel::of(&videotoolbox::VideoToolbox);
pub const QSV: HwAccel = HwAccel::of(&qsv::Qsv);
pub const VAAPI: HwAccel = HwAccel::of(&vaapi::Vaapi);
pub const NVENC: HwAccel = HwAccel::of(&nvenc::Nvenc);
pub const V4L2M2M: HwAccel = HwAccel::of(&v4l2m2m::V4l2m2m);
pub const SOFTWARE: HwAccel = HwAccel::of(&software::Software);

/// The hardware, in the order the probe tries it: by how little the host has to
/// be trusted for it to work. An Apple block is always there and always right,
/// QSV beats VAAPI on the Intel parts that have both, NVENC needs a card the
/// encoder list alone does not prove, and a V4L2 encoder leaves the decode on
/// the CPU.
pub const BY_TRUST: [HwAccel; 5] = [VIDEOTOOLBOX, QSV, VAAPI, NVENC, V4L2M2M];
