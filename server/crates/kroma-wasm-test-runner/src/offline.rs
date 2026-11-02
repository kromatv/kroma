use kroma_wasm_host::{FetchRequest, NetPolicy, Request, Response, Verdict};

const NO_NETWORK: &str = "a test component reaches no network";
const NO_HOST: &str = "a test component has no core to call";

pub(crate) struct Offline;

impl NetPolicy for Offline {
    fn fetch(&self, request: &FetchRequest) -> Verdict {
        Verdict::Block(format!("{NO_NETWORK}: {} {}", request.method, request.url))
    }

    fn download(&self, request: &FetchRequest, _destination: &str) -> Verdict {
        Verdict::Block(format!("{NO_NETWORK}: {} {}", request.method, request.url))
    }

    fn host_api(&self, request: &Request) -> Result<Response, String> {
        Err(format!("{NO_HOST}: {} {}", request.method, request.path))
    }
}
