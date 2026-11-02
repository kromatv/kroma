use std::time::Duration;

use kroma_module_host::media::SampleFormat;
use kroma_module_host::outside::{CommandSpec, DecodeSpec, LanReply, LanService, Outside};

use super::kroma::module::{files, lan, media, process};

pub(super) struct ThroughTheHost;

pub(super) static THROUGH_THE_HOST: ThroughTheHost = ThroughTheHost;

fn millis(duration: Duration) -> u32 {
    u32::try_from(duration.as_millis()).unwrap_or(u32::MAX)
}

impl Outside for ThroughTheHost {
    fn ensure_program(&self, program: &str) -> Result<(), String> {
        process::ensure(program)
    }

    fn spawn_program(&self, command: CommandSpec) -> Result<u64, String> {
        process::spawn(&process::Command {
            program: command.program,
            args: command.args,
            env: command.env,
            cwd: command.cwd,
        })
    }

    fn wait_program(&self, child: u64, timeout: Duration) -> Result<Option<i32>, String> {
        process::wait(child, millis(timeout))
    }

    fn read_program(&self, child: u64, stderr: bool, max_bytes: u32) -> Result<Vec<u8>, String> {
        let which = if stderr {
            process::Output::Stderr
        } else {
            process::Output::Stdout
        };
        process::read(child, which, max_bytes)
    }

    fn kill_program(&self, child: u64, force: bool) -> Result<(), String> {
        process::kill(child, force)
    }

    fn announce(&self, service: LanService) -> Result<u64, String> {
        lan::announce(&lan::Service {
            kind: service.kind,
            name: service.name,
            host: service.host,
            port: service.port,
            properties: service.properties,
        })
    }

    fn withdraw(&self, announcement: u64) {
        lan::withdraw(announcement);
    }

    fn search(&self, target: &str, wait: Duration) -> Result<Vec<LanReply>, String> {
        lan::search(target, millis(wait)).map(|replies| {
            replies
                .into_iter()
                .map(|reply| LanReply {
                    source: reply.source,
                    headers: reply.headers,
                })
                .collect()
        })
    }

    fn addresses(&self) -> Vec<String> {
        lan::addresses()
    }

    fn canonical(&self, path: &str) -> Option<String> {
        files::canonical(path)
    }

    fn copy(&self, source: &str, destination: &str) -> Result<u64, String> {
        files::copy(source, destination)
    }

    fn decode_audio(&self, spec: DecodeSpec) -> Result<u64, String> {
        media::decode_audio(&media::AudioDecode {
            source: spec.source,
            track: spec.track,
            sample_rate: spec.pcm.sample_rate,
            channels: spec.pcm.channels,
            format: match spec.pcm.format {
                SampleFormat::F32le => media::SampleFormat::F32le,
                SampleFormat::S16le => media::SampleFormat::S16le,
            },
            destination: spec.destination,
        })
    }
}
