//! Intro / credits segment detection beyond the chapter titles the probe pass
//! reads (`infra::probe`). Episodes get the audio-fingerprint pass in `job`,
//! which aligns a season pairwise; a film has no sibling to align against, so
//! `credits` reads its ending from the picture (`video`) and its chapter cut.

pub mod credits;
pub mod fingerprint;
pub mod job;
pub mod video;
