use crate::bindings::kroma::module::media;
use crate::state::State;

const NO_MEDIA: &str = "this module does not declare media: [\"decode\"] under permissions";

impl media::Host for State {
    fn decode_audio(&mut self, request: media::AudioDecode) -> Result<u64, String> {
        let media = self.media.clone().ok_or(NO_MEDIA)?;
        media.decode_audio(request)
    }
}
